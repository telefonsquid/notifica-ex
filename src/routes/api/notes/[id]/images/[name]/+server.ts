import { fileNameSchema, isId } from '#lib/schemas.ts';
import { fetchNoteImage, getNoteFor } from '#lib/server/queries.ts';
import { restrictAccess } from '#lib/user.ts';
import { error } from '@sveltejs/kit';

// Sizes pocketbase generates, see the thumbs of the images field
const THUMBS = ['640x0']

// Passes the protected file through to the owner and those the note is shared with
export async function GET({ params, url, locals }) {

    // VERIFY
    restrictAccess(locals.user, 'user')
    const thumb = url.searchParams.get('thumb') ?? undefined
    if(!isId(params.id) || !fileNameSchema.safeParse(params.name).success || (thumb && !THUMBS.includes(thumb))) error(400, 'Malformed request.')

    const note = await getNoteFor(params.id, locals.user.id)
    if(!note.success || !note.data.images.includes(params.name)) error(404, 'Image not found.')

    // STREAM | names never get reused, so the browser may keep it for good
    const file = await fetchNoteImage(params.id, params.name, thumb)
    if(!file.ok || !file.body) error(file.status === 404 ? 404 : 502, 'Could not load the image.')

    return new Response(file.body, {
        headers: {
            'content-type': file.headers.get('content-type') ?? 'application/octet-stream',
            'cache-control': 'private, max-age=31536000, immutable'
        }
    })

}
