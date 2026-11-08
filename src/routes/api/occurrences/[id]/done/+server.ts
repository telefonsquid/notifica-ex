import { setDone } from '#lib/server/occurrences.ts';
import { doneSubject } from '#lib/server/push.ts';
import { signedAction } from '#lib/server/server_auth.ts';
import { getOne } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';

// Called by the done button in a notification
export async function POST({ params, request }) {

    // VERIFY
    await signedAction(params.id, request, doneSubject)

    // CHECK OFF | a second press keeps the first time
    const occurrence = unwrap(await getOne('occurrences', params.id), 'Occurrence not found.')
    if(occurrence.done) return new Response('Already done.', { status: 200 })

    unwrap(await setDone([occurrence], true), 'Could not check off the reminder.')
    return new Response('Done.', { status: 200 });

}
