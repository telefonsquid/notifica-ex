import { getRequestEvent } from '$app/server';
import { unwrap } from '#lib/pocketbase.ts';
import { occurrenceAfter } from '#lib/reminders.ts';
import { idSchema } from '#lib/schema_limits.ts';
import { ntfyTopicSchema, reminderRuleSchema, type ReminderRule } from '#lib/schemas.ts';
import { publish } from '#lib/server/ntfy.ts';
import { deleteOne, getAllOwned, getNoteFor, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
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

// A changed rule starts over, earlier sends no longer count
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

// Ticks off the occurrence that went out last, same as the button in the notification
export const setReminderDone = command(z.object({ id: idSchema, done: z.boolean() }), async ({ id, done }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const reminder = unwrap(await getOwned('reminders', id, locals.user.id), 'Reminder not found.')
    if(done && !reminder.sent) error(400, 'Nothing went out yet.')
    const updated = unwrap(await updateOnePartial('reminders', id, { done: done ? reminder.sent : '' }), 'Could not update the reminder.')

    await getReminders().refresh()
    return updated

});



// HELPERS ============================================================
function ruleFields(rule: ReminderRule) {
    if(rule.repeat === 'weekdays' && !rule.weekdays.length) error(400, 'Pick at least one day.')
    if(rule.until && rule.repeat !== 'never' && new Date(rule.until) < new Date(rule.at)) error(400, 'The end lies before the start.')

    const next = occurrenceAfter(rule, new Date())
    if(!next) error(400, 'That time has already passed.')

    // Only what the chosen repeat uses gets stored
    const weekdays = rule.repeat === 'weekdays' ? rule.weekdays : []
    const until = rule.until && rule.repeat !== 'never' ? new Date(rule.until).toISOString() : ''
    return { ...rule, weekdays, until, at: new Date(rule.at).toISOString(), next: next.toISOString(), sent: '', done: '' }
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
