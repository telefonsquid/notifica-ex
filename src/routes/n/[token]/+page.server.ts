import { noteLink } from '#lib/links.ts';
import { guestView, joinLink, noteByLink } from '#lib/server/note_links.ts';
import { outage } from '#lib/server/outage.ts';
import { redirect } from '@sveltejs/kit';

// Signed in visitors join the note and find it in their grid | everyone else gets the page
export async function load({ locals, params }) {
    if(locals.serverDown) outage()

    const found = await noteByLink(params.token)
    if(!found) return { note: null }

    if(locals.user){
        await joinLink(found.note, locals.user)
        redirect(303, noteLink(found.note.id))
    }

    return { note: guestView(found.note, found.owner) }
}
