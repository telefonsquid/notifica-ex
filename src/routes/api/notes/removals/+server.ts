import { isId } from '#lib/schemas/base.ts';
import { removeFor } from '#lib/server/note_access.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

const bodySchema = z.object({
    ids: z.array(z.string().refine(isId)).max(2000)
});

// Deletes still waiting for their Undo toast when the page closed | no answer reaches anyone, so errors stay here
export async function POST({ request }) {

    // VERIFY
    const me = signedIn()
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if(!body.success) error(400, 'Malformed request.')

    // REMOVE
    for(const id of body.data.ids) await removeFor(id, me.id)
    return new Response(null, { status: 204 });

}
