import { LIMITS, isId } from '#lib/schema_limits.ts';
import { addNoteImages, getNoteFor } from '#lib/server/queries.ts';
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

    // CHECK THE FILES
    const form = await request.formData().catch(() => null)
    const files = form?.getAll('images').filter((entry) => entry instanceof File) ?? []
    if(!files.length) error(400, 'No images attached.')
    if(files.some((file) => !IMAGE_TYPES.includes(file.type))) error(415, 'Only JPEG, PNG, WebP, GIF and AVIF images are supported.')
    if(files.some((file) => file.size > LIMITS.IMAGE_BYTES)) error(413, `An image must not be larger than ${LIMITS.IMAGE_BYTES / 1024 / 1024} MB.`)
    if(note.data.images.length + files.length > LIMITS.NOTE_IMAGES) error(413, `A note holds at most ${LIMITS.NOTE_IMAGES} images.`)

    // STORE
    const updated = await addNoteImages(params.id, files)
    if(!updated.success) error(500, 'Could not store the images.')
    return json(updated.data)

}
