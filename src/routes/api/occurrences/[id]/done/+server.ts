import { checkOff } from '#lib/server/notification_actions.ts';
import { doneSubject } from '#lib/server/push.ts';
import { getOne } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { signedAction } from '#lib/server/server_auth.ts';

// Called by the done button in a notification
export async function POST({ params, request }) {
    await signedAction(params.id, request, doneSubject)
    return checkOff(unwrap(await getOne('occurrences', params.id), 'Occurrence not found.'))
}
