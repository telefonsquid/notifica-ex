import { snoozeUntil } from '#lib/reminders.ts';
import { isId } from '#lib/schemas.ts';
import { snoozeSubject } from '#lib/server/delivery.ts';
import { countOpenOccurrences, getOne, updateOnePartial } from '#lib/server/queries.ts';
import { hasValidSignature } from '#lib/server/server_auth.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

const bodySchema = z.object({
    signature: z.string().length(64),
    until: z.enum(['hour', 'tomorrow'])
});

// Called by the snooze buttons in a notification | no session, the signature stands in for it
export async function POST({ params, request }) {

    // VERIFY
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if(!isId(params.id) || !body.success) error(400, 'Malformed request.')
    if(!hasValidSignature(snoozeSubject(params.id), body.data.signature)) error(403, 'Invalid signature.')

    // A reminder removed since then has nothing left to snooze, the button just goes away
    const occurrence = await getOne('occurrences', params.id)
    if(!occurrence.success) error(404, 'Occurrence not found.')
    if(!occurrence.data.reminder) return new Response('Reminder gone.', { status: 200 })
    const reminder = await getOne('reminders', occurrence.data.reminder)
    if(!reminder.success) return new Response('Reminder gone.', { status: 200 })

    // SNOOZE | regular times before the picked one are skipped, the rule resumes after it
    const next = snoozeUntil(body.data.until, new Date(), reminder.data.timezone)
    const updated = await updateOnePartial('reminders', reminder.data.id, { next: next.toISOString() })
    if(!updated.success) error(500, 'Could not snooze the reminder.')

    // A task fires a new occurrence later, this one must not stay open beside it
    if(occurrence.data.task && !occurrence.data.done){
        await updateOnePartial('occurrences', params.id, { done: new Date().toISOString(), comment: 'Snoozed' })
        await countOpenOccurrences(reminder.data.id)
    }
    return new Response('Snoozed.', { status: 200 });

}
