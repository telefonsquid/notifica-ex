import { formatBytes } from '#lib/limits.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { isId } from '#lib/schemas.ts';
import { limitsFor } from '#lib/server/limits.ts';
import { addNoteFile } from '#lib/server/note_files.ts';
import { getNoteFor } from '#lib/server/queries.ts';
import { restrictAccess } from '#lib/user.ts';
import { error, json } from '@sveltejs/kit';

const FORM_OVERHEAD = 64 * 1024     // bytes, what the form adds around the file

// One file per request, so a progress bar means something and a failure costs one file
export async function POST({ params, request, locals }) {

    // VERIFY
    restrictAccess(locals.user, 'user')
    if(!isId(params.id)) error(400, 'Malformed request.')
    const note = await getNoteFor(params.id, locals.user.id)
    if(!note.success) error(404, 'Note not found.')

    const { attachments, attachmentBytes } = await limitsFor(locals.user)
    if(!attachments) error(403, 'File attachments are turned off for your account.')
    if(note.data.attachments.length >= LIMITS.NOTE_ATTACHMENTS) error(413, `A note holds at most ${LIMITS.NOTE_ATTACHMENTS} files.`)

    // Refused before the whole body sits in memory
    const tooLarge = `A file must not be larger than ${formatBytes(attachmentBytes)}.`
    if(Number(request.headers.get('content-length')) > attachmentBytes + FORM_OVERHEAD) error(413, tooLarge)

    // CHECK THE FILE
    const form = await request.formData().catch(() => null)
    const file = form?.get('attachments')
    if(!(file instanceof File) || !file.size) error(400, 'No file attached.')
    if(file.size > attachmentBytes) error(413, tooLarge)

    // STORE
    return json(await addNoteFile(note.data, 'attachments', file, file.name))

}
