import { isId } from '#lib/schemas.ts';
import { deleteOne, deleteRemindersOn, getNoteFor, leaveNote } from '#lib/server/queries.ts';
import { restrictAccess } from '#lib/user.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

const bodySchema = z.object({
    ids: z.array(z.string().refine(isId)).max(2000)
});

// Deletes still waiting for their Undo toast when the page closed | no answer reaches anyone, so errors stay here
export async function POST({ request, locals }) {

    // VERIFY
    restrictAccess(locals.user, 'user')
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if(!body.success) error(400, 'Malformed request.')

    // REMOVE | a note shared with the user is only left
    const me = locals.user.id
    for(const id of body.data.ids){
        const note = await getNoteFor(id, me)
        if(!note.success) continue

        if(note.data.owner === me) await deleteOne('notes', id)
        else {
            await leaveNote(id, me)
            await deleteRemindersOn(id, [me])
        }
    }
    return new Response(null, { status: 204 });

}
