import z from 'zod';
import { LIMITS } from '#lib/schema_limits.ts';
import { fileNameSchema, idSchema, noteContentSchema, notePositionSchema, type Note } from '#lib/schemas.ts';
import { addNoteImages, deleteOne, deleteRemindersOn, fetchNoteImage, getAll, getAllNotesFor, getAllOwned, getNoteFor, getOwned, insertOnePartial, leaveNote as leave, removeNoteImage, unwrap, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { error } from '@sveltejs/kit';
import { getReminders } from './reminders.remote.ts';

// NOTES ============================================================
export const getNotes = query(async () => {

    const me = signedIn()
    return unwrap(await getAllNotesFor(me.id, { sort: '-pinned,-updated' }), 'Could not load notes.')

});

export const createNote = command(noteContentSchema, async (content) => {

    const me = signedIn()

    const labels = await ownLabels(me.id, content.labels)
    const note = unwrap(await insertOnePartial('notes', { ...content, labels, owner: me.id }), 'Could not save the note.')

    await getNotes().refresh()
    return note

});

// Copies leave reminders and sharing behind | someone else's labels stay with them
export const duplicateNote = command(idSchema, async (id) => {

    const me = signedIn()
    const stored = unwrap(await getNoteFor(id, me.id), 'Note not found.')

    // COPY THE CONTENT
    const { title, body, color, pinned, archived } = stored
    const labels = await ownLabels(me.id, stored.labels)
    let note = unwrap(await insertOnePartial('notes', { title, body, color, pinned, archived, labels, owner: me.id }), 'Could not duplicate the note.')

    // COPY THE IMAGES | pocketbase appends a fresh suffix, so the old one is dropped first
    if(stored.images.length){
        const files = await Promise.all(stored.images.map(async (name) => {
            const response = await fetchNoteImage(stored.id, name)
            if(!response.ok) error(502, 'Could not copy the images.')
            return new File([await response.blob()], name.replace(/_[a-z0-9]{10}(?=\.\w+$)/i, ''), { type: response.headers.get('content-type') ?? undefined })
        }))
        note = unwrap(await addNoteImages(note.id, files), 'Could not copy the images.')
    }

    await getNotes().refresh()
    return note

});

export const updateNote = command(noteContentSchema.partial().extend({ id: idSchema }), async ({ id, ...changes }) => {

    const me = signedIn()
    const found = await getNoteFor(id, me.id)
    if(!found.success) error(404, 'Note not found.') // deleted or unshared meanwhile, the open note tells its writer
    const stored = found.data

    // Pin, archive and labels stay the owner's, the others edit only what the note says
    const update: Partial<Note> = { ...changes }
    if(stored.owner !== me.id){
        delete update.pinned
        delete update.archived
        delete update.labels
    }
    else if(changes.labels) update.labels = await ownLabels(me.id, changes.labels)
    const note = unwrap(await updateOnePartial('notes', id, update), 'Could not save the note.')

    await getNotes().refresh()
    return note

});

// A drag to a new place in a manual sort
export const moveNote = command(z.object({ id: idSchema, position: notePositionSchema }), async ({ id, position }) => {

    const me = signedIn()
    unwrap(await getOwned('notes', id, me.id), 'Note not found.')
    unwrap(await updateOnePartial('notes', id, { position }), 'Could not move the note.')

    await getNotes().refresh()
    return true

});

// Adding goes through POST /api/notes/[id]/images, files don't fit through a command
export const removeImage = command(z.object({ id: idSchema, name: fileNameSchema }), async ({ id, name }) => {

    const me = signedIn()
    unwrap(await getNoteFor(id, me.id), 'Note not found.')
    const note = unwrap(await removeNoteImage(id, name), 'Could not remove the image.')

    await getNotes().refresh()
    return note

});

// Its reminder goes with it through the cascade
export const deleteNote = command(idSchema, async (id) => {

    const me = signedIn()
    unwrap(await getOwned('notes', id, me.id), 'Note not found.')
    unwrap(await deleteOne('notes', id), 'Could not delete the note.')

    await getNotes().refresh()
    return true

});



// SHARING ============================================================

// Only the owner picks who else sees the note | inactive accounts and the owner themself drop out
export const shareNote = command(z.object({ id: idSchema, people: z.array(idSchema).max(LIMITS.NOTE_SHARES, `A note can be shared with at most ${LIMITS.NOTE_SHARES} people.`) }), async ({ id, people }) => {

    const me = signedIn()
    const stored = unwrap(await getOwned('notes', id, me.id), 'Note not found.')

    const active = new Set(unwrap(await getAll('users', { filter: 'state = "active"', fields: 'id' }), 'Could not load people.').map((user) => user.id))
    const shared = [...new Set(people)].filter((person) => person !== me.id && active.has(person))
    const note = unwrap(await updateOnePartial('notes', id, { shared }), 'Could not share the note.')

    // Whoever lost the note loses their reminders on it too, they would push about something they can't open
    const removed = stored.shared.filter((person) => !shared.includes(person))
    unwrap(await deleteRemindersOn(id, removed), 'Could not remove their reminders.')

    await getNotes().refresh()
    return note

});

// Someone else's note disappears from the user's own list again
export const leaveNote = command(idSchema, async (id) => {

    const me = signedIn()
    const note = unwrap(await getNoteFor(id, me.id), 'Note not found.')
    if(note.owner === me.id) error(400, 'You own this note, delete it instead.')
    unwrap(await leave(id, me.id), 'Could not leave the note.')
    unwrap(await deleteRemindersOn(id, [me.id]), 'Could not remove your reminders on it.')

    await Promise.all([getNotes().refresh(), getReminders().refresh()])
    return true

});



// HELPERS ============================================================

// Drops label ids of other users, a note may only point at its owner's labels
async function ownLabels(owner: string, ids: string[]): Promise<string[]> {
    if(!ids.length) return []
    const own = new Set(unwrap(await getAllOwned('labels', owner), 'Could not load labels.').map((label) => label.id))
    return [...new Set(ids)].filter((id) => own.has(id))
}
