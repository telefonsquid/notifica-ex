import { tasksOf, toggleTask } from '#lib/markdown.ts';
import { freshDefaults } from '#lib/notes.ts';
import { describeRule } from '#lib/reminders.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema, limitedText } from '#lib/schemas/base.ts';
import { labelNameSchema, noteColorSchema, noteContentSchema, type Label, type Note } from '#lib/schemas/notes.ts';
import { reminderRuleSchema, type Reminder } from '#lib/schemas/reminders.ts';
import type { User } from '#lib/schemas/users.ts';
import { findLabel, labelIds, labelsOf } from '#lib/server/label_names.ts';
import { collaboratorChanges, getAllNotesFor, requireNote } from '#lib/server/note_access.ts';
import { deleteOne, getAllOwned, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { ruleFields } from '#lib/server/reminder_rules.ts';
import { unwrap } from '#lib/server/result.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

/*
    What an AI may do with the notes of the person whose key it holds. Every tool goes through
    the same owner checks as the app, sharing rules included. Notes can't be deleted from here.
*/

export type Tool = {
    name: string
    title: string
    description: string
    input: z.ZodType
    readOnly: boolean
    destructive?: boolean
    run: (input: unknown, user: User) => Promise<unknown>   // Gets what input parsed
}

function tool<T extends z.ZodType>(definition: Omit<Tool, 'input' | 'run'> & { input: T, run: (input: z.output<T>, user: User) => Promise<unknown> }): Tool {
    return definition as Tool
}

// A label by name or id, both fit the same length
const labelRef = limitedText('Label', Math.max(LIMITS.ID, LIMITS.LABEL_NAME)).trim().min(1)
const labelList = z.array(labelRef).max(LIMITS.NOTE_LABELS)



// NOTES ======================================================================================================
const searchNotes = tool({
    name: 'search_notes',
    title: 'Search notes',
    description: 'Finds notes by words in title or body, label, pin and archive state. Answers with a short summary of each, newest first with pinned ones on top. Use get_note for the full text.',
    readOnly: true,
    input: z.object({
        query: z.string().max(LIMITS.VIEW_WORDS).optional().describe('Words that must all appear in title or body, case does not matter'),
        label: labelRef.optional().describe('Only notes carrying this label, by name or id'),
        archived: z.enum(['exclude', 'only', 'include']).default('exclude').describe('Archived notes are left out unless asked for'),
        pinned: z.boolean().optional(),
        open_tasks: z.boolean().optional().describe('True for notes with unchecked checklist items'),
        limit: z.number().int().min(1).max(100).default(20)
    }),
    run: async (input, user) => {
        const [notes, labels] = await Promise.all([notesOf(user), labelsOf(user.id)])
        const label = input.label ? findLabel(labels, input.label) : null
        if(input.label && !label) error(404, `No label called ${input.label}.`)

        const words = (input.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
        const found = notes.filter((note) => {
            if(input.archived === 'exclude' && note.archived) return false
            if(input.archived === 'only' && !note.archived) return false
            if(input.pinned !== undefined && note.pinned !== input.pinned) return false
            if(label && !note.labels.includes(label.id)) return false
            if(input.open_tasks !== undefined && tasksOf(note.body).includes(false) !== input.open_tasks) return false
            const text = `${note.title}\n${note.body}`.toLowerCase()
            return words.every((word) => text.includes(word))
        })

        return { total: found.length, notes: found.slice(0, input.limit).map((note) => summaryOf(note, labels, user)) }
    }
})

const getNote = tool({
    name: 'get_note',
    title: 'Read a note',
    description: 'The full note: markdown body, labels, checklist state and the reminders the user set on it. A locked note has an empty body, its text is encrypted and only the user can read it. tasks lists every checklist item in reading order, its position is the index set_task takes.',
    readOnly: true,
    input: z.object({ id: idSchema }),
    run: async ({ id }, user) => {
        const [note, labels, reminders] = await Promise.all([requireNote(id, user.id), labelsOf(user.id), remindersOf(user)])
        return {
            ...summaryOf(note, labels, user),
            body: note.body,
            tasks: tasksOf(note.body),
            images: note.images.length,
            attachments: note.attachments.length,
            reminders: reminders.filter((reminder) => reminder.note === id).map(reminderOf)
        }
    }
})

const createNote = tool({
    name: 'create_note',
    title: 'Create a note',
    description: 'Adds a note. The body is markdown, a checklist is a list of "- [ ] item" lines. Labels go by name, ones the user does not have yet get created.',
    readOnly: false,
    input: z.object({
        title: noteContentSchema.shape.title.default(''),
        body: noteContentSchema.shape.body.default(''),
        labels: labelList.default([]).describe('Label names or ids'),
        color: noteColorSchema.default(''),
        pinned: z.boolean().default(false)
    }),
    run: async ({ labels: wanted, ...content }, user) => {
        if(!content.title && !content.body) error(400, 'A note needs a title or a body.')
        const labels = await labelIds(user.id, wanted)
        const note = unwrap(await insertOnePartial('notes', { ...freshDefaults(content, user.noteColor), labels, archived: false, owner: user.id }), 'Could not save the note.')
        return summaryOf(note, await labelsOf(user.id), user)
    }
})

const updateNote = tool({
    name: 'update_note',
    title: 'Change a note',
    description: 'Changes the given fields and keeps the rest. Archive a note to put it away, there is no delete. On a note someone shared with the user only title, body and color can change.',
    readOnly: false,
    input: z.object({
        id: idSchema,
        title: noteContentSchema.shape.title.optional(),
        body: noteContentSchema.shape.body.optional().describe('Replaces the whole body'),
        color: noteColorSchema.optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
        labels: labelList.optional().describe('Replaces every label, by name or id'),
        add_labels: labelList.optional().describe('Adds these, missing ones get created'),
        remove_labels: labelList.optional()
    }),
    run: async ({ id, labels: replaced, add_labels, remove_labels, ...changes }, user) => {
        const note = await requireNote(id, user.id)
        const owned = note.owner === user.id
        const touchesLabels = replaced || add_labels || remove_labels

        // Said out loud instead of dropped, so the model doesn't think it worked
        if(note.sealed && changes.body !== undefined) error(403, 'This note is locked, only the user can change its text.')
        if(!owned && (touchesLabels || changes.pinned !== undefined || changes.archived !== undefined)) error(403, 'Only the owner can change pin, archive and labels of this note.')

        const update: Partial<Note> = owned ? { ...changes } : collaboratorChanges(changes)
        if(touchesLabels){
            const removed = new Set(await labelIds(user.id, remove_labels ?? [], false))
            const kept = replaced ? await labelIds(user.id, replaced) : note.labels
            update.labels = [...new Set([...kept, ...await labelIds(user.id, add_labels ?? [])])].filter((label) => !removed.has(label))
        }

        const saved = unwrap(await updateOnePartial('notes', id, update), 'Could not save the note.')
        return summaryOf(saved, await labelsOf(user.id), user)
    }
})

const setTask = tool({
    name: 'set_task',
    title: 'Check off a checklist item',
    description: 'Checks or unchecks one checklist item of a note, by its index in get_note\'s tasks.',
    readOnly: false,
    input: z.object({ id: idSchema, index: z.number().int().min(0), done: z.boolean() }),
    run: async ({ id, index, done }, user) => {
        const note = await requireNote(id, user.id)
        if(note.sealed) error(403, 'This note is locked, only the user can check off its items.')
        const tasks = tasksOf(note.body)
        if(index >= tasks.length) error(400, `The note has ${tasks.length} checklist items.`)
        if(tasks[index] === done) return { id, tasks }

        const saved = unwrap(await updateOnePartial('notes', id, { body: toggleTask(note.body, index) }), 'Could not save the note.')
        return { id, tasks: tasksOf(saved.body) }
    }
})



// LABELS =====================================================================================================
const listLabels = tool({
    name: 'list_labels',
    title: 'List labels',
    description: 'Every label of the user with how many notes carry it.',
    readOnly: true,
    input: z.object({}),
    run: async (_, user) => {
        const [labels, notes] = await Promise.all([labelsOf(user.id), notesOf(user)])
        return labels.map((label) => ({ id: label.id, name: label.name, color: label.color, notes: notes.filter((note) => note.labels.includes(label.id)).length }))
    }
})

const createLabel = tool({
    name: 'create_label',
    title: 'Create a label',
    description: 'Adds a label. Names are unique per user.',
    readOnly: false,
    input: z.object({ name: labelNameSchema, color: noteColorSchema.default('') }),
    run: async ({ name, color }, user) => {
        const label = unwrap(await insertOnePartial('labels', { name, color, owner: user.id }), 'A label with that name already exists.')
        return { id: label.id, name: label.name, color: label.color }
    }
})



// REMINDERS ==================================================================================================
const listReminders = tool({
    name: 'list_reminders',
    title: 'List reminders',
    description: 'The user\'s reminders, the next one due first. A reminder without next went off and is finished.',
    readOnly: true,
    input: z.object({ note: idSchema.optional().describe('Only the reminders on this note') }),
    run: async ({ note }, user) => {
        const reminders = await remindersOf(user)
        return reminders.filter((reminder) => !note || reminder.note === note).map(reminderOf)
    }
})

const createReminder = tool({
    name: 'create_reminder',
    title: 'Set a reminder',
    description: 'Sets a reminder on a note, sent as a push notification. at is the first time, as ISO 8601 with offset. repeat with every sets the step, i.e. repeat "hours" every 16. weekdays takes mo to su for repeat "weekdays". task adds a Done button.',
    readOnly: false,
    input: reminderRuleSchema.extend({
        note: idSchema,
        repeat: reminderRuleSchema.shape.repeat.default('never'),
        every: reminderRuleSchema.shape.every.default(1),
        task: z.boolean().default(false),
        timezone: reminderRuleSchema.shape.timezone.describe('IANA zone like Europe/Berlin, keeps the clock time across daylight saving')
    }),
    run: async ({ note, ...rule }, user) => {
        await requireNote(note, user.id)
        const reminder = unwrap(await insertOnePartial('reminders', { ...ruleFields(rule), note, owner: user.id }), 'Could not save the reminder.')
        return reminderOf(reminder)
    }
})

const deleteReminder = tool({
    name: 'delete_reminder',
    title: 'Remove a reminder',
    description: 'Removes one of the user\'s reminders. Its history stays.',
    readOnly: false,
    destructive: true,
    input: z.object({ id: idSchema }),
    run: async ({ id }, user) => {
        unwrap(await getOwned('reminders', id, user.id), 'Reminder not found.')
        unwrap(await deleteOne('reminders', id), 'Could not remove the reminder.')
        return { removed: id }
    }
})

export const TOOLS: Tool[] = [searchNotes, getNote, createNote, updateNote, setTask, listLabels, createLabel, listReminders, createReminder, deleteReminder]



// HELPERS ====================================================================================================
async function notesOf(user: User) {
    const notes = unwrap(await getAllNotesFor(user.id), 'Could not load notes.')
    return notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated.localeCompare(a.updated))
}

async function remindersOf(user: User) {
    return unwrap(await getAllOwned('reminders', user.id, { sort: 'next' }), 'Could not load reminders.')
}

// Labels of someone else's note stay theirs, so only the user's own show
function summaryOf(note: Note, labels: Label[], user: User) {
    const tasks = tasksOf(note.body)
    return {
        id: note.id,
        title: note.title,
        preview: note.body.slice(0, 200),
        locked: !!note.sealed,                  // Its text is encrypted in the browser, the body stays empty here
        labels: note.labels.flatMap((id) => labels.find((label) => label.id === id)?.name ?? []),
        color: note.color,
        pinned: note.pinned,
        archived: note.archived,
        shared_with_user: note.owner !== user.id,
        open_tasks: tasks.filter((done) => !done).length,
        done_tasks: tasks.filter(Boolean).length,
        updated: note.updated
    }
}

function reminderOf(reminder: Reminder) {
    return {
        id: reminder.id,
        note: reminder.note,
        rule: describeRule(reminder),
        at: reminder.at,
        next: reminder.next || null,
        until: reminder.until || null,
        timezone: reminder.timezone,
        task: reminder.task,
        open_tasks: reminder.open
    }
}
