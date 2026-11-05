import { isId } from '#lib/schema_limits.ts';
import { countOpenOccurrences, getOne, updateOnePartial } from '#lib/server/queries.ts';
import { doneSubject } from '#lib/server/delivery.ts';
import { hasValidSignature } from '#lib/server/server_auth.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

const bodySchema = z.object({
    signature: z.string().length(64)
});

// Called by the done button in a notification | no session, the signature stands in for it
export async function POST({ params, request }) {

    // VERIFY
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if(!isId(params.id) || !body.success) error(400, 'Malformed request.')
    if(!hasValidSignature(doneSubject(params.id), body.data.signature)) error(403, 'Invalid signature.')

    // CHECK OFF | a second press keeps the first time
    const occurrence = await getOne('occurrences', params.id)
    if(!occurrence.success) error(404, 'Occurrence not found.')
    if(occurrence.data.done) return new Response('Already done.', { status: 200 })

    const updated = await updateOnePartial('occurrences', params.id, { done: new Date().toISOString() })
    if(!updated.success) error(500, 'Could not check off the reminder.')
    if(occurrence.data.reminder) await countOpenOccurrences(occurrence.data.reminder)
    return new Response('Done.', { status: 200 });

}
