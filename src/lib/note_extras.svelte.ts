import { uploadAttachment } from '#lib/attachments.ts';
import { shrink, uploadImage } from '#lib/images.ts';
import { formatBytes, type FileInfo } from '#lib/limits.ts';
import type { NoteSession } from '#lib/note_session.svelte.ts';
import { kept } from '#lib/note_list.ts';
import { notify } from '#lib/notifications.svelte.ts';
import { safeAction } from '#lib/safe_action.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import type { Note } from '#lib/schemas/notes.ts';
import type { FileLimits } from '#lib/schemas/users.ts';
import { untrack } from 'svelte';
import { removeFile, shareNote } from '../routes/api/notes.remote';

type Options = {
    session: NoteSession
    note: () => Note | null
    limits: () => FileLimits
}

const tooLarge = (file: File, most: number) => `${file.name} is larger than ${formatBytes(most)}.`

// Images only get measured once shrunk
function fitting(file: File, most: number): File {
    if(file.size > most) throw new Error(tooLarge(file, most))
    return file
}

// What fits into the room left, the rest gets named once
function withinRoom(files: File[], room: number, most: number, noun: string): File[] {
    if(files.length > room) notify(`A note holds at most ${most} ${noun}.`, { type: 'error' })
    return files.slice(0, Math.max(room, 0))
}

/*
    A note's files and people, stored apart from its draft.
    Uploads show as local previews or rows until they're through.
*/
export class NoteExtras {
    images = $state<string[]>([])
    attachments = $state<string[]>([])
    fileInfo = $state.raw<FileInfo | null>(null)
    shared = $state<string[]>([])
    uploads = $state<{ key: string, url: string }[]>([])
    sending = $state<{ key: string, name: string, bytes: number, share: number }[]>([])

    #session: NoteSession
    #limits: () => FileLimits
    #at = ''

    constructor({ session, note: current, limits }: Options){
        this.#session = session
        this.#limits = limits

        const initial = untrack(current)
        this.images = initial?.images ?? []
        this.attachments = initial?.attachments ?? []
        this.fileInfo = initial?.fileInfo ?? null
        this.shared = initial?.shared ?? []
        this.#at = initial?.updated ?? ''

        // A copy older than the last change made here is stale
        $effect.pre(() => {
            const note = current()
            if(!note || note.updated < this.#at) return
            if(!this.uploads.length) this.images = note.images
            if(!this.sending.length) this.attachments = note.attachments
            if(!this.uploads.length && !this.sending.length) this.fileInfo = note.fileInfo
            this.shared = note.shared
        })
    }

    #stored(result: Note){
        this.images = result.images
        this.attachments = result.attachments
        this.fileInfo = result.fileInfo
        this.shared = result.shared
        this.#at = result.updated
    }

    // One after the other, on a note stored first
    async #send<Entry>(files: File[], queued: Entry[], send: (noteId: string, file: File, entry: Entry) => Promise<Note>, finish: (entry: Entry) => void){
        const noteId = await this.#session.store()
        for(const [index, file] of files.entries()){
            const result = noteId && await safeAction(send(noteId, file, queued[index]))
            if(result) this.#stored(result)
            finish(queued[index])
        }
    }

    addImages = async (added: File[]) => {
        const files = withinRoom(added, LIMITS.NOTE_IMAGES - this.images.length - this.uploads.length, LIMITS.NOTE_IMAGES, 'images')
        if(!files.length) return

        const queued = files.map((file) => ({ key: crypto.randomUUID(), url: URL.createObjectURL(file) }))
        this.uploads = [...this.uploads, ...queued]

        await this.#send(files, queued,
            (noteId, file) => shrink(file).then((small) => uploadImage(noteId, fitting(small, this.#limits().imageBytes))),
            ({ key, url }) => {
                URL.revokeObjectURL(url)
                this.uploads = this.uploads.filter((upload) => upload.key !== key)
            }
        )
    }

    // Too large ones get named and left out
    addAttachments = async (added: File[]) => {
        const files = withinRoom(added, LIMITS.NOTE_ATTACHMENTS - this.attachments.length - this.sending.length, LIMITS.NOTE_ATTACHMENTS, 'files')
        const { attachmentBytes } = this.#limits()
        for(const file of files){
            if(file.size > attachmentBytes) notify(tooLarge(file, attachmentBytes), { type: 'error' })
        }
        const fitting = files.filter((file) => file.size <= attachmentBytes)
        if(!fitting.length) return

        const queued = fitting.map((file) => ({ key: crypto.randomUUID(), name: file.name, bytes: file.size, share: 0 }))
        this.sending = [...this.sending, ...queued]

        await this.#send(fitting, queued,
            (noteId, file, { key }) => uploadAttachment(noteId, file, (share) => {
                this.sending = this.sending.map((entry) => entry.key === key ? { ...entry, share } : entry)
            }),
            ({ key }) => this.sending = this.sending.filter((entry) => entry.key !== key)
        )
    }

    drop = async (field: 'images' | 'attachments', name: string) => {
        const { id } = this.#session
        if(!id) return
        this[field] = this[field].filter((file) => file !== name)
        const result = await safeAction(kept(removeFile({ id, field, name })))
        if(result) this.#stored(result)
    }

    share = async (people: string[]) => {
        this.shared = people
        const noteId = await this.#session.store()
        const result = noteId && await safeAction(kept(shareNote({ id: noteId, people })))
        if(result) this.#stored(result)
    }
}
