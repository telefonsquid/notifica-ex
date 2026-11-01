import { isId } from '#lib/schema_limits.ts';
import { imageNameSchema } from '#lib/schemas.ts';
import { fetchImage, getNoteOf } from '#lib/server/queries.ts';
import { error } from '@sveltejs/kit';

// The sizes pocketbase prepares, see the images field in pb_schema.json
const THUMBS = ['640x0', '1280x0']

// IMAGE | passed through from pocketbase for everyone who sees the note, a file name never changes so browsers keep it
export async function GET({ params, url, locals }) {

    // ACCESS
    if(!locals.user) error(401, 'Log in to see this image.')
    if(!isId(params.id) || !imageNameSchema.safeParse(params.file).success) error(400, 'Malformed request.')
    const note = await getNoteOf(params.id, locals.user.id)
    if(!note.success || !note.data.images.includes(params.file)) error(404, 'Image not found.')

    // PASS THROUGH
    const thumb = url.searchParams.get('size') ?? undefined
    const image = await fetchImage(note.data, params.file, thumb && THUMBS.includes(thumb) ? thumb : undefined)
    if(!image.ok || !image.body) error(502, 'Could not load the image.')

    return new Response(image.body, {
        headers: {
            'content-type': image.headers.get('content-type') ?? 'application/octet-stream',
            'cache-control': 'private, max-age=31536000, immutable',
        }
    })

}
