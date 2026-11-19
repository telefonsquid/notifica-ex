import { LIMITS } from '#lib/schema_limits.ts';
import type { LinkedNote, Note, NoteLinkMode } from '#lib/schemas/notes.ts';
import type { User } from '#lib/schemas/users.ts';
import { canSee, deleteRemindersOn } from '#lib/server/note_access.ts';
import { findOne, getOne, updateOnePartial } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { error } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';

// One link per note, anyone holding it reads or edits | stored plain so the owner can copy it again

// FINDING ====================================================================================================

// A link of a turned off note, or of an inactive owner, leads nowhere
export async function noteByLink(token: string) {
    if(!/^[\w-]{20,64}$/.test(token)) return null

    const note = orNull(await findOne('notes', 'linkToken = {:token} && linkMode != ""', undefined, { token }), 'Could not open the link.')
    if(!note) return null

    const owner = orNull(await getOne('users', note.owner), 'Could not open the link.')
    if(!owner || owner.state !== 'active') return null

    return { note, owner }
}

export async function requireNoteByLink(token: string) {
    const found = await noteByLink(token)
    if(!found) error(404, 'This link is no longer valid.')
    return found
}

// What a visitor without an account gets to see
export function guestView(note: Note, owner: User): LinkedNote {
    const { id, title, body, color, images, attachments, fileInfo, linkMode, updated } = note
    return { id, title, body, color, images, attachments, fileInfo, mode: linkMode, owner: owner.name, updated }
}



// JOINING ====================================================================================================

// A signed in visitor finds the note in their own grid from now on
export async function joinLink(note: Note, user: User) {
    if(canSee(note, user.id)) return
    if(note.linked.length >= LIMITS.NOTE_LINKED) error(409, `This link was opened by ${LIMITS.NOTE_LINKED} people already, ask the owner to share the note directly.`)
    unwrap(await updateOnePartial('notes', note.id, { 'linked+': [user.id] } as Partial<Note>), 'Could not add the note.')
}



// MANAGING ===================================================================================================

const newToken = () => randomBytes(24).toString('base64url')

// Turning it off drops everyone who joined | a renewed link stops the old one, those who joined keep the note
export async function setLink(note: Note, mode: NoteLinkMode, renew: boolean) {
    if(note.sealed && mode) error(400, 'Locked notes cannot be shared, unlock it first.')

    if(!mode){
        const saved = unwrap(await updateOnePartial('notes', note.id, { linkMode: '', linkToken: '', linked: [] } as Partial<Note>), 'Could not turn the link off.')
        await dropLinked(note, note.linked)
        return saved
    }

    const linkToken = renew || !note.linkToken ? newToken() : note.linkToken
    return unwrap(await updateOnePartial('notes', note.id, { linkMode: mode, linkToken } as Partial<Note>), 'Could not change the link.')
}

export async function removeLinked(note: Note, person: string) {
    const saved = unwrap(await updateOnePartial('notes', note.id, { 'linked-': [person] } as Partial<Note>), 'Could not remove them.')
    await dropLinked(note, [person])
    return saved
}

// Reminders of people who lost the note | someone it is also shared with keeps theirs
async function dropLinked(note: Note, people: string[]) {
    const gone = people.filter((person) => !note.shared.includes(person))
    unwrap(await deleteRemindersOn(note.id, gone), 'Could not remove their reminders.')
}
