import { isId } from '#lib/schemas/base.ts';
import { keyHolder } from '#lib/server/stream_key.ts';
import { checkFile, checkRoom } from '#lib/server/note_file_routes.ts';
import { requireOwnNote } from '#lib/server/note_access.ts';
import { addNoteFile } from '#lib/server/note_files.ts';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// One image of a share, the raw bytes as the body | a form would need an Origin the app doesn't send
export const POST: RequestHandler = async ({ params, url, request }) => {

    // VERIFY
    const user = await keyHolder(params.user, url.searchParams.get('key') ?? '')
    if(!isId(params.note)) error(400, 'Malformed request.')
    const note = await requireOwnNote(params.note, user.id)
    const most = await checkRoom('images', note, user, Number(request.headers.get('content-length')))

    // CHECK THE FILE
    const bytes = await request.arrayBuffer()
    if(!bytes.byteLength) error(400, 'No image attached.')
    const file = new File([bytes], 'shared', { type: request.headers.get('content-type') ?? '' })
    checkFile('images', file, most)

    // STORE
    await addNoteFile(note, 'images', file)
    return json({ stored: true })

}
