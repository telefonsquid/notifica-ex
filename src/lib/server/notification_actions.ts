import { parseTimestamp, SNOOZE_CHOICES, snoozeUntil } from '#lib/reminders.ts';
import type { Occurrence } from '#lib/schemas/reminders.ts';
import { getOccurrenceAt, setDone, snooze } from '#lib/server/occurrences.ts';
import { getOne } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { signedAction } from '#lib/server/server_auth.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

// The Done and Snooze buttons in notifications | signed per occurrence, or per reminder and time when the phone's alarm got there first

export const snoozeChoice = z.object({
    until: z.enum(SNOOZE_CHOICES)
});

// VERIFY ====================================================================================================

// The button of an alarm | 409 until the dispatch run logged that time, the phone tries again
// 410 once the reminder moved past that time without it, the phone's schedule was older than an edit
export async function slotAction<T = unknown>(params: { id: string, at: string }, request: Request, subject: (reminder: string, at: Date) => string, fields?: z.ZodType<T>) {
    if(!/^\d{1,15}$/.test(params.at)) error(400, 'Malformed request.')
    const at = new Date(Number(params.at))

    const extra = await signedAction(params.id, request, (reminder) => subject(reminder, at), fields)
    const occurrence = await getOccurrenceAt(params.id, at)
    if(occurrence) return { occurrence, extra }

    const reminder = orNull(await getOne('reminders', params.id), 'Could not read the reminder.')
    const next = parseTimestamp(reminder?.next)
    if(!next || next > at) error(410, 'This reminder moved on.')
    error(409, 'Not sent yet.')
}



// ACT ====================================================================================================

// A second press keeps the first time
export async function checkOff(occurrence: Occurrence) {
    if(occurrence.done) return new Response('Already done.', { status: 200 })

    unwrap(await setDone([occurrence], true), 'Could not check off the reminder.')
    return new Response('Done.', { status: 200 })
}

// The time of day follows the reminder's own zone | a reminder removed since then has nothing left to snooze, the button just goes away
export async function snoozeFor(occurrence: Occurrence, until: z.infer<typeof snoozeChoice>['until']) {
    const snoozed = await snooze(occurrence, (reminder) => snoozeUntil(until, new Date(), reminder.timezone))
    return new Response(snoozed ? 'Snoozed.' : 'Reminder gone.', { status: 200 })
}
