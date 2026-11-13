import { snoozeChoice, snoozeFor } from '#lib/server/notification_actions.ts';
import { snoozeSubject } from '#lib/server/push.ts';
import { getOne } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { signedAction } from '#lib/server/server_auth.ts';

// Called by the snooze buttons in a notification
export async function POST({ params, request }) {
    const { until } = await signedAction(params.id, request, snoozeSubject, snoozeChoice)
    return snoozeFor(unwrap(await getOne('occurrences', params.id), 'Occurrence not found.'), until)
}
