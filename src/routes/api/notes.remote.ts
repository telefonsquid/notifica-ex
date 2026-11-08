import z from 'zod';
import { contentOf } from '#lib/notes.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema } from '#lib/schemas/base.ts';
import { fileNameSchema, noteContentSchema, notePositionSchema } from '#lib/schemas/notes.ts';
import { collaboratorChanges, deleteRemindersOn, getAllNotesFor, ownLabels, removeFor, requireNote, requireOwnNote } from '#lib/server/note_access.ts';
import { duplicateWithFiles, removeNoteFile } from '#lib/server/note_files.ts';
import { getAll, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { getReminders } from './reminders.remote.ts';

// NOTES ============================================================
// Commands on one note answer with that note, #lib/note_list.ts puts it into the list | the whole list would weigh hundreds of KB per save
export const getNotes = query(async () => {

    const me = signedIn()
    return unwrap(await getAllNotesFor(me.id, { sort: '-pinned,-updated' }), 'Could not load notes.')

});

export const createNote = command(noteContentSchema, async (content) => {

    const me = signedIn()

    const labels = await ownLabels(me.id, content.labels)
    return unwrap(await insertOnePartial('notes', { ...content, labels, owner: me.id }), 'Could not save the note.')

});

// Copies leave reminders and sharing behind | someone else's labels stay with them
export const duplicateNote = command(idSchema, async (id) => {

    const me = signedIn()
    const stored = await requireNote(id, me.id)

    const content = contentOf(stored)
    const labels = await ownLabels(me.id, content.labels)
    return await duplicateWithFiles(stored, { ...content, labels, owner: me.id })

});

export const updateNote = command(noteContentSchema.partial().extend({ id: idSchema }), async ({ id, ...changes }) => {

    const me = signedIn()
    const stored = await requireNote(id, me.id) // Deleted or unshared meanwhile, the 404 tells the open note's writer

    const update = stored.owner !== me.id ? collaboratorChanges(changes) : { ...changes, ...(changes.labels ? { labels: await ownLabels(me.id, changes.labels) } : {}) }
    return unwrap(await updateOnePartial('notes', id, update), 'Could not save the note.')

});

// A drag to a new place in a manual sort
export const moveNote = command(z.object({ id: idSchema, position: notePositionSchema }), async ({ id, position }) => {

    const me = signedIn()
    await requireOwnNote(id, me.id)
    return unwrap(await updateOnePartial('notes', id, { position }), 'Could not move the note.')

});

// Adding goes through POST /api/notes/[id]/images or attachments, files don't fit through a command | stays possible with attachments turned off, to free storage
export const removeFile = command(z.object({ id: idSchema, field: z.enum(['images', 'attachments']), name: fileNameSchema }), async ({ id, field, name }) => {

    const me = signedIn()
    return await removeNoteFile(await requireNote(id, me.id), field, name)

});

// Its reminders go with it | a note shared with the user is only left, the owner keeps it
export const removeNote = command(idSchema, async (id) => {

    const me = signedIn()
    unwrap(await removeFor(id, me.id), 'Could not remove the note.')

    await Promise.all([getNotes().refresh(), getReminders().refresh()])
    return true

});



// SHARING ============================================================

// Only the owner picks who else sees the note | inactive accounts and the owner themself drop out
export const shareNote = command(z.object({ id: idSchema, people: z.array(idSchema).max(LIMITS.NOTE_SHARES, `A note can be shared with at most ${LIMITS.NOTE_SHARES} people.`) }), async ({ id, people }) => {

    const me = signedIn()
    const stored = await requireOwnNote(id, me.id)

    const active = new Set(unwrap(await getAll('users', { filter: 'state = "active"', fields: 'id' }), 'Could not load people.').map((user) => user.id))
    const shared = [...new Set(people)].filter((person) => person !== me.id && active.has(person))
    const note = unwrap(await updateOnePartial('notes', id, { shared }), 'Could not share the note.')

    // Whoever lost the note loses their reminders on it too, they would push about something they can't open
    const removed = stored.shared.filter((person) => !shared.includes(person))
    unwrap(await deleteRemindersOn(id, removed), 'Could not remove their reminders.')

    return note

});
