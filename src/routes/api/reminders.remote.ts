import { getRequestEvent } from '$app/server';
import { unwrap } from '#lib/pocketbase.ts';
import { occurrenceAfter } from '#lib/reminders.ts';
import { idSchema } from '#lib/schema_limits.ts';
import { ntfyTopicSchema, reminderRuleSchema } from '#lib/schemas.ts';
import { publish } from '#lib/server/ntfy.ts';
import { deleteOne, getAllOwned, getOwned, getReminderOfNote, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
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

// One reminder per note | setting it again replaces the rule and starts over
export const setReminder = command(reminderRuleSchema.extend({ note: idSchema }), async ({ note, ...rule }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('notes', note, locals.user.id), 'Note not found.')

    const next = occurrenceAfter(rule, new Date())
    if(!next) error(400, 'That time has already passed.')

    const fields = { ...rule, at: new Date(rule.at).toISOString(), next: next.toISOString(), sent: '', done: '' }
    const existing = await getReminderOfNote(note, locals.user.id)
    const reminder = existing.success
        ? unwrap(await updateOnePartial('reminders', existing.data.id, fields), 'Could not save the reminder.')
        : unwrap(await insertOnePartial('reminders', { ...fields, note, owner: locals.user.id }), 'Could not save the reminder.')

    await getReminders().refresh()
    return reminder

});

export const removeReminder = command(idSchema, async (note) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const reminder = unwrap(await getReminderOfNote(note, locals.user.id), 'Reminder not found.')
    unwrap(await deleteOne('reminders', reminder.id), 'Could not remove the reminder.')

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
