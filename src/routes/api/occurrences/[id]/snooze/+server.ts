import { SNOOZE_CHOICES, snoozeUntil } from '#lib/reminders.ts';
import { setDone } from '#lib/server/occurrences.ts';
import { snoozeSubject } from '#lib/server/push.ts';
import { getOne, updateOnePartial } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { signedAction } from '#lib/server/server_auth.ts';
import { z } from 'zod';

const choiceSchema = z.object({
    until: z.enum(SNOOZE_CHOICES)
});

// Called by the snooze buttons in a notification
export async function POST({ params, request }) {

    // VERIFY
    const { until } = await signedAction(params.id, request, snoozeSubject, choiceSchema)

    // A reminder removed since then has nothing left to snooze, the button just goes away
    const occurrence = unwrap(await getOne('occurrences', params.id), 'Occurrence not found.')
    const reminder = occurrence.reminder ? orNull(await getOne('reminders', occurrence.reminder), 'Could not snooze the reminder.') : null
    if(!reminder) return new Response('Reminder gone.', { status: 200 })

    // SNOOZE | regular times before the picked one are skipped, the rule resumes after it
    const next = snoozeUntil(until, new Date(), reminder.timezone)
    unwrap(await updateOnePartial('reminders', reminder.id, { next: next.toISOString() }), 'Could not snooze the reminder.')

    // A task fires a new occurrence later, this one must not stay open beside it
    if(occurrence.task) await setDone([occurrence], true, 'Snoozed')
    return new Response('Snoozed.', { status: 200 });

}
