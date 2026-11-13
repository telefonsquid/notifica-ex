import { resolve } from '$app/paths';
import { TEST_CHANNELS } from '#lib/reminders.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema } from '#lib/schemas/base.ts';
import { reminderRuleSchema } from '#lib/schemas/reminders.ts';
import { ntfyTopicSchema, pushSubscriptionSchema } from '#lib/schemas/users.ts';
import { streamSubject } from '#lib/server/app_stream.ts';
import { deliverTest } from '#lib/server/delivery.ts';
import { requireNote } from '#lib/server/note_access.ts';
import { getNewestOpenOccurrence, getOccurrences, getOpenOccurrences, setDone, snooze } from '#lib/server/occurrences.ts';
import { deleteOne, findOne, getAllOwned, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { ruleFields } from '#lib/server/reminder_rules.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { sign } from '#lib/server/server_auth.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

// REMINDERS ============================================================
export const getReminders = query(async () => {

    const me = signedIn()
    return unwrap(await getAllOwned('reminders', me.id, { sort: 'next' }), 'Could not load reminders.')

});

// A note holds as many as wanted
export const addReminder = command(reminderRuleSchema.extend({ note: idSchema }), async ({ note, ...rule }) => {

    const me = signedIn()
    await requireNote(note, me.id)

    const reminder = unwrap(await insertOnePartial('reminders', { ...ruleFields(rule), note, owner: me.id }), 'Could not save the reminder.')

    await getReminders().refresh()
    return reminder

});

// A changed rule starts over, the history stays
export const updateReminder = command(reminderRuleSchema.extend({ id: idSchema }), async ({ id, ...rule }) => {

    const me = signedIn()
    unwrap(await getOwned('reminders', id, me.id), 'Reminder not found.')

    const reminder = unwrap(await updateOnePartial('reminders', id, ruleFields(rule)), 'Could not save the reminder.')

    await getReminders().refresh()
    return reminder

});

export const removeReminder = command(idSchema, async (id) => {

    const me = signedIn()
    unwrap(await getOwned('reminders', id, me.id), 'Reminder not found.')
    unwrap(await deleteOne('reminders', id), 'Could not remove the reminder.')

    await getReminders().refresh()
    return true

});

// Ticks off the one occurrence still open, the card's Done button only offers this while there is just one
export const setReminderDone = command(idSchema, async (id) => {

    const me = signedIn()
    unwrap(await getOwned('reminders', id, me.id), 'Reminder not found.')
    const occurrence = unwrap(await getNewestOpenOccurrence(id), 'Nothing left to check off.')
    unwrap(await setDone([occurrence], true), 'Could not check off the reminder.')

    await getReminders().refresh()
    return true

});



// HISTORY ============================================================
export const getHistory = query(z.object({ note: idSchema, limit: z.number().int().min(1).max(LIMITS.PAGE_SIZE) }), async ({ note, limit }) => {

    const me = signedIn()
    const [page, open] = await Promise.all([getOccurrences(note, me.id, limit), getOpenOccurrences(note, me.id)])
    const { items, totalItems } = unwrap(page, 'Could not load the history.')
    return { items, total: totalItems, open: unwrap(open, 'Could not load the history.').length }

});

// Done and undo for any time in the history
export const setOccurrenceDone = command(z.object({ id: idSchema, done: z.boolean() }), async ({ id, done }) => {

    const me = signedIn()
    const occurrence = unwrap(await getOwned('occurrences', id, me.id), 'Occurrence not found.')
    if(!occurrence.task) error(400, 'This reminder had no Done button.')

    const [updated] = unwrap(await setDone([occurrence], done), 'Could not update the reminder.')

    await getReminders().refresh()
    return updated ?? occurrence

});

// Picked in the app after the Android notification's Reschedule button
export const rescheduleOccurrence = command(z.object({ id: idSchema, at: z.iso.datetime({ offset: true }) }), async ({ id, at }) => {

    const me = signedIn()
    const occurrence = unwrap(await getOwned('occurrences', id, me.id), 'Occurrence not found.')

    const next = new Date(at)
    if(next.getTime() <= Date.now()) error(400, 'Pick a time in the future.')
    if(!await snooze(occurrence, () => next)) error(404, 'This reminder was removed.')

    await getReminders().refresh()
    return next.toISOString()

});

// A few words on one check, written only in the history
export const setOccurrenceComment = command(z.object({ id: idSchema, comment: z.string().trim().max(LIMITS.OCCURRENCE_COMMENT) }), async ({ id, comment }) => {

    const me = signedIn()
    unwrap(await getOwned('occurrences', id, me.id), 'Occurrence not found.')
    return unwrap(await updateOnePartial('occurrences', id, { comment }), 'Could not save the comment.')

});

// Ticks off every time still open on a note, for when a lot piled up
export const checkOffHistory = command(z.object({ note: idSchema }), async ({ note }) => {

    const me = signedIn()
    const open = unwrap(await getOpenOccurrences(note, me.id), 'Could not load the history.')

    unwrap(await setDone(open, true), 'Could not check off the reminder.')

    await getReminders().refresh()
    return open.length

});



// DELIVERY ============================================================
export const setNtfyTopic = command(ntfyTopicSchema, async (topic) => {

    const me = signedIn()
    unwrap(await updateOnePartial('users', me.id, { ntfyTopic: topic }), 'Could not save the topic.')
    return topic

});

export const setNtfyPaused = command(z.boolean(), async (paused) => {

    const me = signedIn()
    unwrap(await updateOnePartial('users', me.id, { ntfyPaused: paused }), 'Could not save the setting.')
    return true

});

// Holds for the whole account, so a browser can silence the phones too
export const setAppPaused = command(z.boolean(), async (paused) => {

    const me = signedIn()
    const changes = paused ? { appPaused: true } : { appPaused: false, appResumed: new Date().toISOString() }
    unwrap(await updateOnePartial('users', me.id, changes), 'Could not save the setting.')
    return true

});

const testSchema = z.object({ channel: z.enum(TEST_CHANNELS), endpoint: pushSubscriptionSchema.shape.endpoint.optional() })

export const sendTestReminder = command(testSchema, async ({ channel, endpoint }) => {

    const me = signedIn()

    const results = await deliverTest(me, channel, endpoint)
    if(!results.length) error(400, 'Nothing is listening there right now.')

    const failed = results.find((result) => !result.success)
    if(failed) error(502, failed.error ?? 'Could not send the test.')

    return true

});

// Browsers register here to get reminders while closed | a second account in the same browser takes it over
export const addPushSubscription = command(pushSubscriptionSchema, async (subscription) => {

    const me = signedIn()

    const known = orNull(await findOne('push_subscriptions', 'endpoint = {:endpoint}', undefined, { endpoint: subscription.endpoint }), 'Could not turn on notifications.')
    const saved = known
        ? await updateOnePartial('push_subscriptions', known.id, { ...subscription, owner: me.id })
        : await insertOnePartial('push_subscriptions', { ...subscription, owner: me.id })
    unwrap(saved, 'Could not turn on notifications.')
    return true

});

export const removePushSubscription = command(pushSubscriptionSchema.shape.endpoint, async (endpoint) => {

    const me = signedIn()

    const known = orNull(await findOne('push_subscriptions', 'endpoint = {:endpoint} && owner = {:owner}', undefined, { endpoint, owner: me.id }), 'Could not turn off notifications.')
    if(known) unwrap(await deleteOne('push_subscriptions', known.id), 'Could not turn off notifications.')
    return true

});

// Address the Android app listens on, a query so only the app ever asks for it
export const getAppStream = query(async () => {

    const me = signedIn()
    return `${resolve('/api/app-stream/[user]', { user: me.id })}?key=${sign(streamSubject(me))}`

});
