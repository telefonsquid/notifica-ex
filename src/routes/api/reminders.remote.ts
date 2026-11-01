import { getRequestEvent } from '$app/server';
import { occurrenceAfter } from '#lib/reminders.ts';
import { idSchema, LIMITS } from '#lib/schema_limits.ts';
import { ntfyTopicSchema, reminderRuleSchema, type ReminderRule } from '#lib/schemas.ts';
import { publish } from '#lib/server/ntfy.ts';
import { countOpenOccurrences, deleteOne, findOne, getAllOwned, getNoteFor, getOccurrences, getOpenOccurrences, getOwned, insertOnePartial, unwrap, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { restrictAccess } from '#lib/user.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

// REMINDERS ============================================================
export const getReminders = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    return unwrap(await getAllOwned('reminders', locals.user.id, { sort: 'next' }), 'Could not load reminders.')

});

// A note holds as many as wanted
export const addReminder = command(reminderRuleSchema.extend({ note: idSchema }), async ({ note, ...rule }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getNoteFor(note, locals.user.id), 'Note not found.')

    const reminder = unwrap(await insertOnePartial('reminders', { ...ruleFields(rule), note, owner: locals.user.id }), 'Could not save the reminder.')

    await getReminders().refresh()
    return reminder

});

// A changed rule starts over, the history stays
export const updateReminder = command(reminderRuleSchema.extend({ id: idSchema }), async ({ id, ...rule }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('reminders', id, locals.user.id), 'Reminder not found.')

    const reminder = unwrap(await updateOnePartial('reminders', id, ruleFields(rule)), 'Could not save the reminder.')

    await getReminders().refresh()
    return reminder

});

export const removeReminder = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('reminders', id, locals.user.id), 'Reminder not found.')
    unwrap(await deleteOne('reminders', id), 'Could not remove the reminder.')

    await getReminders().refresh()
    return true

});

// Ticks off the one occurrence still open, the card's Done button only offers this while there is just one
export const setReminderDone = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('reminders', id, locals.user.id), 'Reminder not found.')
    const occurrence = unwrap(await findOne('occurrences', 'reminder = {:id} && task = true && done = ""', { sort: '-at' }, { id }), 'Nothing left to check off.')
    unwrap(await updateOnePartial('occurrences', occurrence.id, { done: new Date().toISOString() }), 'Could not check off the reminder.')
    unwrap(await countOpenOccurrences(id), 'Could not update the reminder.')

    await getReminders().refresh()
    return true

});



// HISTORY ============================================================
export const getHistory = query(z.object({ note: idSchema, limit: z.number().int().min(1).max(LIMITS.PAGE_SIZE) }), async ({ note, limit }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const [page, open] = await Promise.all([getOccurrences(note, locals.user.id, limit), getOpenOccurrences(note, locals.user.id)])
    const { items, totalItems } = unwrap(page, 'Could not load the history.')
    return { items, total: totalItems, open: unwrap(open, 'Could not load the history.').length }

});

// Done and undo for any time in the history
export const setOccurrenceDone = command(z.object({ id: idSchema, done: z.boolean() }), async ({ id, done }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const occurrence = unwrap(await getOwned('occurrences', id, locals.user.id), 'Occurrence not found.')
    if(!occurrence.task) error(400, 'This reminder had no Done button.')

    const updated = unwrap(await updateOnePartial('occurrences', id, { done: done ? new Date().toISOString() : '' }), 'Could not update the reminder.')
    if(occurrence.reminder) unwrap(await countOpenOccurrences(occurrence.reminder), 'Could not update the reminder.')

    await getReminders().refresh()
    return updated

});

// A few words on one check, written only in the history
export const setOccurrenceComment = command(z.object({ id: idSchema, comment: z.string().trim().max(LIMITS.OCCURRENCE_COMMENT) }), async ({ id, comment }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('occurrences', id, locals.user.id), 'Occurrence not found.')
    return unwrap(await updateOnePartial('occurrences', id, { comment }), 'Could not save the comment.')

});



// HELPERS ============================================================
function ruleFields(rule: ReminderRule) {
    if(rule.repeat === 'weekdays' && !rule.weekdays.length) error(400, 'Pick at least one day.')
    if(rule.until && rule.repeat !== 'never' && new Date(rule.until) < new Date(rule.at)) error(400, 'The end lies before the start.')

    // A time already passed is kept as finished
    const next = occurrenceAfter(rule, new Date())

    // Only what the chosen repeat uses gets stored
    const weekdays = rule.repeat === 'weekdays' ? rule.weekdays : []
    const until = rule.until && rule.repeat !== 'never' ? new Date(rule.until).toISOString() : ''
    const rules = rule.repeat === 'never' ? [] : rule.rules
    return { ...rule, weekdays, until, rules, at: new Date(rule.at).toISOString(), next: next?.toISOString() ?? '' }
}



// DELIVERY ============================================================
export const setNtfyTopic = command(ntfyTopicSchema, async (topic) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await updateOnePartial('users', locals.user.id, { ntfyTopic: topic }), 'Could not save the topic.')
    return topic

});

export const sendTestReminder = command(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    if(!locals.user.ntfyTopic) error(400, 'Set a topic first.')

    const result = await publish({ topic: locals.user.ntfyTopic, title: 'notifica-ex', message: 'Reminders reach this device.', tags: ['bell'] })
    if(!result.success) error(502, result.error)
    return true

});

// Ticks off every time still open on a note, for when a lot piled up
export const checkOffHistory = command(z.object({ note: idSchema }), async ({ note }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const open = unwrap(await getOpenOccurrences(note, locals.user.id), 'Could not load the history.')

    const now = new Date().toISOString()
    for(const occurrence of open) unwrap(await updateOnePartial('occurrences', occurrence.id, { done: now }), 'Could not check off the reminder.')

    // Recount each reminder once
    for(const reminder of new Set(open.map((occurrence) => occurrence.reminder).filter(Boolean))){
        unwrap(await countOpenOccurrences(reminder), 'Could not update the reminder.')
    }

    await getReminders().refresh()
    return open.length

});
