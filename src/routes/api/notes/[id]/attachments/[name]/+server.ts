import { fileNameSchema, isId } from '#lib/schemas.ts';
import { fetchNoteFile, getNoteFor } from '#lib/server/queries.ts';
import { restrictAccess } from '#lib/user.ts';
import { error } from '@sveltejs/kit';

// Always a download under its own name | shown inline, an uploaded page could run scripts on this origin
export async function GET({ params, locals }) {

    // VERIFY
    restrictAccess(locals.user, 'user')
    if(!isId(params.id) || !fileNameSchema.safeParse(params.name).success) error(400, 'Malformed request.')

    const note = await getNoteFor(params.id, locals.user.id)
    if(!note.success || !note.data.attachments.includes(params.name)) error(404, 'File not found.')

    // STREAM | names never get reused, so the browser may keep it for good
    const file = await fetchNoteFile(params.id, params.name)
    if(!file.ok || !file.body) error(file.status === 404 ? 404 : 502, 'Could not load the file.')

    const shown = note.data.fileInfo?.[params.name]?.name ?? params.name
    const length = file.headers.get('content-length')

    return new Response(file.body, {
        headers: {
            'content-type': 'application/octet-stream',
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(shown)}`,
            'x-content-type-options': 'nosniff',
            'cache-control': 'private, max-age=31536000, immutable',
            ...(length ? { 'content-length': length } : {})
        }
    })

}
