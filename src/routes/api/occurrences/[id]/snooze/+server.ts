import { SNOOZE_CHOICES, snoozeUntil } from '#lib/reminders.ts';
import { snooze } from '#lib/server/occurrences.ts';
import { snoozeSubject } from '#lib/server/push.ts';
import { getOne } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { signedAction } from '#lib/server/server_auth.ts';
import { z } from 'zod';

const choiceSchema = z.object({
    until: z.enum(SNOOZE_CHOICES)
});

// Called by the snooze buttons in a notification
export async function POST({ params, request }) {

    // VERIFY
    const { until } = await signedAction(params.id, request, snoozeSubject, choiceSchema)
    const occurrence = unwrap(await getOne('occurrences', params.id), 'Occurrence not found.')

    // SNOOZE | the time of day follows the reminder's own zone
    const snoozed = await snooze(occurrence, (reminder) => snoozeUntil(until, new Date(), reminder.timezone))

    // A reminder removed since then has nothing left to snooze, the button just goes away
    return new Response(snoozed ? 'Snoozed.' : 'Reminder gone.', { status: 200 });

}
