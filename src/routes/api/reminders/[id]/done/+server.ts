import { isId } from '#lib/schema_limits.ts';
import { getOne, updateOnePartial } from '#lib/server/queries.ts';
import { doneSubject } from '#lib/server/reminders.ts';
import { hasValidSignature } from '#lib/server/server_auth.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

const bodySchema = z.object({
    occurrence: z.string().max(64),
    signature: z.string().length(64)
});

// Called by the done button in a notification | no session, the signature stands in for it
export async function POST({ params, request }) {

    // VERIFY
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if(!isId(params.id) || !body.success) error(400, 'Malformed request.')
    if(!hasValidSignature(doneSubject(params.id, body.data.occurrence), body.data.signature)) error(403, 'Invalid signature.')

    // CHECK OFF | only the occurrence that was sent last, a stale button does nothing
    const reminder = await getOne('reminders', params.id)
    if(!reminder.success) error(404, 'Reminder not found.')
    if(reminder.data.sent !== body.data.occurrence) return new Response('Already moved on.', { status: 200 })

    const updated = await updateOnePartial('reminders', params.id, { done: body.data.occurrence })
    if(!updated.success) error(500, 'Could not check off the reminder.')
    return new Response('Done.', { status: 200 });

}
