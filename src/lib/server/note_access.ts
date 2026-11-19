import type { FetchOptions } from '#lib/schemas/base.ts';
import type { Note, NoteContent } from '#lib/schemas/notes.ts';
import { deleteOne, getAllOwned, getOwned, run } from '#lib/server/queries.ts';
import { OK, unwrap, type Result } from '#lib/server/result.ts';
import { error } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';

// Who may see and change which note | every note read on behalf of a person goes through here

// READING ====================================================================================================

// The notes listRule and viewRule in pb_schema.json say the same for a signed in request
const ACCESS = '(owner = {:user} || shared.id ?= {:user} || (linkMode != "" && linked.id ?= {:user}))'

type Members = Pick<Note, 'owner' | 'shared' | 'linkMode' | 'linked'>

export function canSee(note: Members, user: string) {
    return note.owner === user || note.shared.includes(user) || !!note.linkMode && note.linked.includes(user)
}

// People who joined through a read only link only look
export function canEdit(note: Members, user: string) {
    return note.owner === user || note.shared.includes(user) || note.linkMode === 'write' && note.linked.includes(user)
}

export async function getAllNotesFor(user: string, options?: Omit<FetchOptions, 'filter'>) {
    return run((pb) => {
        const filter = pb.filter(ACCESS, { user })
        return pb.collection('notes').getFullList({ ...options, filter }) as Promise<Note[]>
    })
}

async function getNoteFor(id: string, user: string) {
    return run((pb) => {
        const filter = pb.filter(`id = {:id} && ${ACCESS}`, { id, user })
        return pb.collection('notes').getFirstListItem(filter) as Promise<Note>
    })
}

export async function requireNote(id: string, user: string) {
    return unwrap(await getNoteFor(id, user), 'Note not found.')
}

export async function requireEditableNote(id: string, user: string) {
    const note = await requireNote(id, user)
    if(!canEdit(note, user)) error(403, 'This note is read only for you.')
    return note
}

export async function requireOwnNote(id: string, user: string) {
    return unwrap(await getOwned('notes', id, user), 'Note not found.')
}



// CHANGING ===================================================================================================

// Pin, archive and labels stay the owner's, the others edit only what the note says
export function collaboratorChanges({ title, body, color }: Partial<NoteContent>): Partial<NoteContent> {
    return { title, body, color }
}

// Drops label ids of other users, a note may only point at its owner's labels
export async function ownLabels(owner: string, ids: string[]): Promise<string[]> {
    if(!ids.length) return []
    const own = new Set(unwrap(await getAllOwned('labels', owner), 'Could not load labels.').map((label) => label.id))
    return [...new Set(ids)].filter((id) => own.has(id))
}

// Reminders people set on a note they no longer see | their history stays theirs
export async function deleteRemindersOn(note: string, owners: string[]) {
    return run((pb) => dropReminders(pb, note, owners))
}

async function dropReminders(pb: PocketBase, note: string, owners: string[]) {
    if(!owners.length) return true
    const people = owners.map((owner, index) => pb.filter(`owner = {:owner${index}}`, { [`owner${index}`]: owner })).join(' || ')
    const found = await pb.collection('reminders').getFullList({ filter: `${pb.filter('note = {:note}', { note })} && (${people})`, fields: 'id' })
    for(const reminder of found){ await pb.collection('reminders').delete(reminder.id) }
    return true
}

async function leave(id: string, user: string) {
    return run(async (pb) => {
        await pb.collection('notes').update(id, { 'shared-': [user], 'linked-': [user] })
        return await dropReminders(pb, id, [user])
    })
}

// A note shared with the user is only left | a note already gone counts as removed
export async function removeFor(id: string, user: string): Promise<Result<unknown>> {
    const note = await getNoteFor(id, user)
    const result = !note.success ? note : note.data.owner === user ? await deleteOne('notes', id) : await leave(id, user)
    return !result.success && result.status === 404 ? OK : result
}
