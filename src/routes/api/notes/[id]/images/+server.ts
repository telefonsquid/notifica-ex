import { formatBytes } from '#lib/limits.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { isId } from '#lib/schemas.ts';
import { limitsFor } from '#lib/server/limits.ts';
import { addNoteFile } from '#lib/server/note_files.ts';
import { getNoteFor } from '#lib/server/queries.ts';
import { restrictAccess } from '#lib/user.ts';
import { error, json } from '@sveltejs/kit';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

// Files don't fit through remote functions, so images arrive as a plain form post
export async function POST({ params, request, locals }) {

    // VERIFY
    restrictAccess(locals.user, 'user')
    if(!isId(params.id)) error(400, 'Malformed request.')
    const note = await getNoteFor(params.id, locals.user.id)
    if(!note.success) error(404, 'Note not found.')

    // CHECK THE FILE
    const { imageBytes } = await limitsFor(locals.user)
    const form = await request.formData().catch(() => null)
    const file = form?.get('images')
    if(!(file instanceof File)) error(400, 'No image attached.')
    if(!IMAGE_TYPES.includes(file.type)) error(415, 'Only JPEG, PNG, WebP, GIF and AVIF images are supported.')
    if(file.size > imageBytes) error(413, `An image must not be larger than ${formatBytes(imageBytes)}.`)
    if(note.data.images.length >= LIMITS.NOTE_IMAGES) error(413, `A note holds at most ${LIMITS.NOTE_IMAGES} images.`)

    // STORE
    return json(await addNoteFile(note.data, 'images', file))

}
