import { loginPath } from '#lib/return_path.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { insertOnePartial } from '#lib/server/queries.ts';
import { redirect } from '@sveltejs/kit';

// SHARE TARGET | the installed app receives shared text and links here, see static/manifest.webmanifest
// Lands as a new note that opens right away, an expired session logs in first and comes back
export async function GET({ url, locals }) {

    if(!locals.user) redirect(303, loginPath(url))

    // CONTENT | apps fill the fields differently, a link often comes as the text
    const title = (url.searchParams.get('title') ?? '').trim()
    const text = (url.searchParams.get('text') ?? '').trim()
    const link = (url.searchParams.get('url') ?? '').trim()
    const body = [text, link && !text.includes(link) ? link : ''].filter(Boolean).join('\n\n')
    if(!title && !body) redirect(303, '/')

    const note = await insertOnePartial('notes', {
        title: title.slice(0, LIMITS.NOTE_TITLE),
        body: body.slice(0, LIMITS.NOTE_BODY),
        owner: locals.user.id
    })
    if(!note.success) redirect(303, '/')
    redirect(303, `/?note=${note.data.id}`)

}
