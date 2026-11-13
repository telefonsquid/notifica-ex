import { formatBytes } from '#lib/limits.ts';
import { IMAGE_THUMB, IMAGE_TYPES, LIMITS, UPLOAD_FORM_OVERHEAD } from '#lib/schema_limits.ts';
import { isId } from '#lib/schemas/base.ts';
import { fileNameSchema, type Note } from '#lib/schemas/notes.ts';
import type { FileLimits, User } from '#lib/schemas/users.ts';
import { limitsFor } from '#lib/server/limits.ts';
import { requireNote } from '#lib/server/note_access.ts';
import { addNoteFile, fetchNoteFile, type FileField } from '#lib/server/note_files.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { error, json, type RequestEvent } from '@sveltejs/kit';

// What sets one file field of a note apart | the rest of its two routes is the same
type FilePolicy = {
    one: string                     // "An image", opens the size message
    noun: string
    plural: string
    most: number
    bytes: (limits: FileLimits) => number
    turnedOff?: (limits: FileLimits) => boolean
    wrongType?: (file: File) => string | null
    keepsName: boolean
    thumbs: readonly string[]
    headers: (file: Response, shown: string) => Record<string, string>
}

const POLICIES: Record<FileField, FilePolicy> = {
    images: {
        one: 'An image',
        noun: 'image',
        plural: 'images',
        most: LIMITS.NOTE_IMAGES,
        bytes: (limits) => limits.imageBytes,
        wrongType: (file) => IMAGE_TYPES.includes(file.type) ? null : 'Only JPEG, PNG, WebP, GIF and AVIF images are supported.',
        keepsName: false,
        thumbs: [IMAGE_THUMB],
        headers: (file) => ({ 'content-type': file.headers.get('content-type') ?? 'application/octet-stream' }),
    },

    attachments: {
        one: 'A file',
        noun: 'file',
        plural: 'files',
        most: LIMITS.NOTE_ATTACHMENTS,
        bytes: (limits) => limits.attachmentBytes,
        turnedOff: (limits) => !limits.attachments,
        keepsName: true,
        thumbs: [],

        // Always a download under its own name | shown inline, an uploaded page could run scripts on this origin
        headers: (_, shown) => ({
            'content-type': 'application/octet-stream',
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(shown)}`,
        }),
    },
}



// UPLOAD | files don't fit through remote functions, one per request so a progress bar means something and a failure costs one file
export function uploadRoute(field: FileField) {
    const policy = POLICIES[field]

    return async ({ params, request }: RequestEvent<{ id: string }>) => {

        // VERIFY
        const me = signedIn()
        if(!isId(params.id)) error(400, 'Malformed request.')
        const note = await requireNote(params.id, me.id)
        const most = await checkRoom(field, note, me, Number(request.headers.get('content-length')) - UPLOAD_FORM_OVERHEAD)

        // CHECK THE FILE
        const form = await request.formData().catch(() => null)
        const file = form?.get(field)
        if(!(file instanceof File) || !file.size) error(400, `No ${policy.noun} attached.`)
        checkFile(field, file, most)

        // STORE
        return json(await addNoteFile(note, field, file, policy.keepsName ? file.name : undefined))

    }
}

// Whether the uploader may add one more file to the note | refused before the whole body sits in memory, answers the largest size allowed
export async function checkRoom(field: FileField, note: Note, uploader: User, announced: number) {
    const policy = POLICIES[field]
    if(note.sealed) error(400, 'Locked notes hold no files, their text alone is encrypted.')

    const limits = await limitsFor(uploader)
    if(policy.turnedOff?.(limits)) error(403, 'File attachments are turned off for your account.')
    if(note[field].length >= policy.most) error(413, `A note holds at most ${policy.most} ${policy.plural}.`)

    const most = policy.bytes(limits)
    if(announced > most) error(413, tooLarge(policy, most))
    return most
}

export function checkFile(field: FileField, file: File, most: number) {
    const policy = POLICIES[field]
    const wrongType = policy.wrongType?.(file)
    if(wrongType) error(415, wrongType)
    if(file.size > most) error(413, tooLarge(policy, most))
}

function tooLarge(policy: FilePolicy, most: number) {
    return `${policy.one} must not be larger than ${formatBytes(most)}.`
}



// DOWNLOAD | passes the protected file through to the owner and those the note is shared with
export function downloadRoute(field: FileField) {
    const policy = POLICIES[field]
    const capitalized = policy.noun[0].toUpperCase() + policy.noun.slice(1)

    return async ({ params, url }: RequestEvent<{ id: string, name: string }>) => {

        // VERIFY
        const me = signedIn()
        const thumb = url.searchParams.get('thumb') ?? undefined
        if(!isId(params.id) || !fileNameSchema.safeParse(params.name).success || (thumb && !policy.thumbs.includes(thumb))) error(400, 'Malformed request.')

        const note = await requireNote(params.id, me.id)
        if(!note[field].includes(params.name)) error(404, `${capitalized} not found.`)

        // STREAM | names never get reused, so the browser may keep it for good
        const file = await fetchNoteFile(params.id, params.name, thumb)
        if(!file.ok || !file.body) error(file.status === 404 ? 404 : 502, `Could not load the ${policy.noun}.`)

        const length = file.headers.get('content-length')
        return new Response(file.body, {
            headers: {
                ...policy.headers(file, note.fileInfo?.[params.name]?.name ?? params.name),
                'x-content-type-options': 'nosniff',
                'cache-control': 'private, max-age=31536000, immutable',
                ...(length ? { 'content-length': length } : {}),
            }
        })

    }
}
