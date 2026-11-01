import { isId, LIMITS } from '#lib/schema_limits.ts';
import { IMAGE_TYPES } from '#lib/schemas.ts';
import { addImages, getNoteOf } from '#lib/server/queries.ts';
import { restrictAccess } from '#lib/user.ts';
import { error, json } from '@sveltejs/kit';

// UPLOAD | multipart with one or more "images", everyone the note is shared with may add some
export async function POST({ params, request, locals }) {

    // ACCESS
    restrictAccess(locals.user, 'user')
    if(!isId(params.id)) error(400, 'Malformed request.')
    const note = await getNoteOf(params.id, locals.user.id)
    if(!note.success) error(404, 'Note not found.')

    // CHECK THE FILES | the same limits pocketbase enforces, but with a message people understand
    const files = (await request.formData()).getAll('images').filter((item) => item instanceof File)
    if(!files.length) error(400, 'No image in the upload.')
    if(note.data.images.length + files.length > LIMITS.NOTE_IMAGES) error(400, `A note holds at most ${LIMITS.NOTE_IMAGES} images.`)
    for(const file of files){
        if(!(IMAGE_TYPES as readonly string[]).includes(file.type)) error(400, `${file.name} is no image this app can show.`)
        if(file.size > LIMITS.IMAGE_BYTES) error(400, `${file.name} is larger than ${LIMITS.IMAGE_BYTES / 1024 / 1024} MB.`)
    }

    // STORE
    const updated = await addImages(params.id, files)
    if(!updated.success) error(400, { message: 'Could not store the images.', details: updated.error })
    return json({ images: updated.data.images })

}
