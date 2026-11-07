import { firstOccurrence } from '#lib/reminders.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema, ntfyTopicSchema, pushSubscriptionSchema, reminderRuleSchema, type ReminderRule } from '#lib/schemas.ts';
import { streamSubject } from '#lib/server/app_stream.ts';
import { deliverTest } from '#lib/server/delivery.ts';
import { countOpenOccurrences, deleteOne, findOne, getAllOwned, getNoteFor, getOccurrences, getOpenOccurrences, getOwned, insertOnePartial, unwrap, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
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
    unwrap(await getNoteFor(note, me.id), 'Note not found.')

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
    const occurrence = unwrap(await findOne('occurrences', 'reminder = {:id} && task = true && done = ""', { sort: '-at' }, { id }), 'Nothing left to check off.')
    unwrap(await updateOnePartial('occurrences', occurrence.id, { done: new Date().toISOString() }), 'Could not check off the reminder.')
    unwrap(await countOpenOccurrences(id), 'Could not update the reminder.')

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

    const updated = unwrap(await updateOnePartial('occurrences', id, { done: done ? new Date().toISOString() : '' }), 'Could not update the reminder.')
    if(occurrence.reminder) unwrap(await countOpenOccurrences(occurrence.reminder), 'Could not update the reminder.')

    await getReminders().refresh()
    return updated

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

    const now = new Date().toISOString()
    for(const occurrence of open) unwrap(await updateOnePartial('occurrences', occurrence.id, { done: now }), 'Could not check off the reminder.')

    // Recount each reminder once
    for(const reminder of new Set(open.map((occurrence) => occurrence.reminder).filter(Boolean))){
        unwrap(await countOpenOccurrences(reminder), 'Could not update the reminder.')
    }

    await getReminders().refresh()
    return open.length

});



// HELPERS ============================================================
function ruleFields(rule: ReminderRule) {
    if(rule.repeat === 'weekdays' && !rule.weekdays.length) error(400, 'Pick at least one day.')
    if(rule.until && rule.repeat !== 'never' && new Date(rule.until) < new Date(rule.at)) error(400, 'The end lies before the start.')

    // A time already passed is kept as finished
    const next = firstOccurrence(rule, new Date())

    // Only what the chosen repeat uses gets stored
    const weekdays = rule.repeat === 'weekdays' ? rule.weekdays : []
    const until = rule.until && rule.repeat !== 'never' ? new Date(rule.until).toISOString() : ''
    const rules = rule.repeat === 'never' ? [] : rule.rules
    return { ...rule, weekdays, until, rules, at: new Date(rule.at).toISOString(), next: next?.toISOString() ?? '' }
}



// DELIVERY ============================================================
export const setNtfyTopic = command(ntfyTopicSchema, async (topic) => {

    const me = signedIn()
    unwrap(await updateOnePartial('users', me.id, { ntfyTopic: topic }), 'Could not save the topic.')
    return topic

});

export const setNtfyPaused = command(z.boolean(), async (paused) => {

    const me = signedIn()
    unwrap(await updateOnePartial('users', me.id, { ntfyPaused: paused }), 'Could not save the setting.')
    return paused

});

const testSchema = z.object({ channel: z.enum(['phone', 'browser', 'ntfy']), endpoint: pushSubscriptionSchema.shape.endpoint.optional() })

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

    const known = await findOne('push_subscriptions', 'endpoint = {:endpoint}', undefined, { endpoint: subscription.endpoint })
    const saved = known.success
        ? await updateOnePartial('push_subscriptions', known.data.id, { ...subscription, owner: me.id })
        : await insertOnePartial('push_subscriptions', { ...subscription, owner: me.id })
    unwrap(saved, 'Could not turn on notifications.')
    return true

});

export const removePushSubscription = command(pushSubscriptionSchema.shape.endpoint, async (endpoint) => {

    const me = signedIn()

    const known = await findOne('push_subscriptions', 'endpoint = {:endpoint} && owner = {:owner}', undefined, { endpoint, owner: me.id })
    if(known.success) unwrap(await deleteOne('push_subscriptions', known.data.id), 'Could not turn off notifications.')
    return true

});

// Address the Android app listens on, a query so only the app ever asks for it
export const getAppStream = query(async () => {

    const me = signedIn()
    return `/api/app-stream/${me.id}?key=${sign(streamSubject(me.id))}`

});
