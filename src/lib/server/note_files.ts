import { formatBytes, usedBytes, type FileInfo } from '#lib/limits.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import type { Note } from '#lib/schemas/notes.ts';
import { limitsFor } from '#lib/server/limits.ts';
import { outage } from '#lib/server/outage.ts';
import { getPbAdminConnection } from '#lib/server/pocketbase_admin_connection.ts';
import { deleteOne, getAllOwned, getOne, insertOnePartial, run, updateOnePartial } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { error } from '@sveltejs/kit';

export type FileField = 'images' | 'attachments'

// STORE ======================================================================================================
// Protected, so every fetch needs a short lived token
let fileToken: { value: string, expires: number } | null = null

export async function fetchNoteFile(id: string, name: string, thumb?: string) {
    if(!fileToken || fileToken.expires < Date.now()){
        const value = unwrap(await run((pb) => pb.files.getToken()), 'Could not load the file.')
        fileToken = { value, expires: Date.now() + 60_000 } // Pocketbase keeps it valid for a few minutes
    }

    const pb = await getPbAdminConnection()
    const url = new URL(`/api/files/notes/${encodeURIComponent(id)}/${encodeURIComponent(name)}`, pb.baseURL)
    url.searchParams.set('token', fileToken.value)
    if(thumb) url.searchParams.set('thumb', thumb)
    return await fetch(url).catch(() => outage())
}

// Appends to what the note already holds
function appendNoteFile(id: string, field: FileField, file: File) {
    const form = new FormData()
    form.append(`${field}+`, file)
    return run((pb) => pb.collection('notes').update(id, form) as Promise<Note>)
}

function dropNoteFile(id: string, field: FileField, name: string, fileInfo: FileInfo) {
    return run((pb) => pb.collection('notes').update(id, { [`${field}-`]: [name], fileInfo }) as Promise<Note>)
}



// ONE AT A TIME PER OWNER ====================================================================================
// Two uploads must not both pass the storage check, nor overwrite each other's sizes | one process, so a promise chain does it
const turns = new Map<string, Promise<unknown>>()

function inTurn<T>(owner: string, work: () => Promise<T>): Promise<T> {
    const result = (turns.get(owner) ?? Promise.resolve()).then(work)
    const settled = result.catch(() => null)
    turns.set(owner, settled)
    settled.then(() => { if(turns.get(owner) === settled) turns.delete(owner) })
    return result
}



// STORAGE ====================================================================================================
async function storageUsed(owner: string) {
    return usedBytes(unwrap(await getAllOwned('notes', owner, { fields: 'fileInfo' }), 'Could not read the storage in use.'))
}

async function requireRoom(owner: string, bytes: number) {
    const limits = await limitsFor(unwrap(await getOne('users', owner), 'Could not read the storage limit.'))
    const used = await storageUsed(owner)
    if(used + bytes > limits.storageBytes) error(413, `Not enough storage left, ${formatBytes(used)} of ${formatBytes(limits.storageBytes)} in use.`)
}



// ADD AND REMOVE =============================================================================================
// Counts against the note's owner, whoever uploads | name is what an attachment gets shown as
export function addNoteFile(note: Pick<Note, 'id' | 'owner'>, field: FileField, file: File, name?: string) {
    return inTurn(note.owner, async () => {
        const before = unwrap(await getOne('notes', note.id), 'Note not found.')
        await requireRoom(note.owner, file.size)

        // STORE
        const updated = unwrap(await appendNoteFile(note.id, field, file), 'Could not store the file.')
        const stored = updated[field].find((existing) => !before[field].includes(existing))
        if(!stored) error(500, 'Could not store the file.')

        // RECORD ITS SIZE | a file nobody counts must not stay
        const entry = { bytes: file.size, ...(name ? { name: name.slice(0, LIMITS.ATTACHMENT_NAME) } : {}) }
        const fileInfo: FileInfo = { ...updated.fileInfo, [stored]: entry }
        const counted = await updateOnePartial('notes', note.id, { fileInfo })
        if(counted.success) return counted.data

        await dropNoteFile(note.id, field, stored, updated.fileInfo ?? {})
        error(500, 'Could not store the file.')
    })
}

export function removeNoteFile(note: Pick<Note, 'id' | 'owner'>, field: FileField, name: string) {
    return inTurn(note.owner, async () => {
        const current = unwrap(await getOne('notes', note.id), 'Note not found.')
        const fileInfo = { ...current.fileInfo }
        delete fileInfo[name]
        return unwrap(await dropNoteFile(note.id, field, name, fileInfo), 'Could not remove the file.')
    })
}



// COPY =======================================================================================================
// The copy counts in full against its new owner | no per file limit, nothing new comes in
async function copyNoteFiles(from: Note, to: Note) {
    const bytes = usedBytes([from])
    if(bytes) await requireRoom(to.owner, bytes)

    let copy = to
    for(const field of ['images', 'attachments'] as const){
        for(const name of from[field]){
            const response = await fetchNoteFile(from.id, name)
            if(!response.ok) error(502, 'Could not copy the files.')

            // Pocketbase appends a fresh suffix, so the old one goes first
            const shown = from.fileInfo?.[name]?.name
            const file = new File([await response.blob()], shown ?? name.replace(/_[a-z0-9]{10}(?=\.\w+$)/i, ''), { type: response.headers.get('content-type') ?? undefined })
            copy = await addNoteFile(to, field, file, shown)
        }
    }
    return copy
}

// A note without its files would pass for a whole copy
export async function duplicateWithFiles(from: Note, content: Partial<Note>) {
    const note = unwrap(await insertOnePartial('notes', content), 'Could not duplicate the note.')
    try {
        return await copyNoteFiles(from, note)
    } catch(err) {
        await deleteOne('notes', note.id)
        throw err
    }
}
