import { getRequestEvent } from '$app/server';
import z from 'zod';
import { unwrap } from '#lib/pocketbase.ts';
import { LIMITS, idSchema } from '#lib/schema_limits.ts';
import { fileNameSchema, noteContentSchema, notePositionSchema, type Note } from '#lib/schemas.ts';
import { addNoteImages, deleteOne, fetchNoteImage, getAll, getAllNotesFor, getAllOwned, getNoteFor, getOwned, insertOnePartial, leaveNote as leave, removeNoteImage, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { restrictAccess } from '#lib/user.ts';
import { error } from '@sveltejs/kit';

// NOTES ============================================================
export const getNotes = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    return unwrap(await getAllNotesFor(locals.user.id, { sort: '-pinned,-updated' }), 'Could not load notes.')

});

export const createNote = command(noteContentSchema, async (content) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')

    const labels = await ownLabels(locals.user.id, content.labels)
    const note = unwrap(await insertOnePartial('notes', { ...content, labels, owner: locals.user.id }), 'Could not save the note.')

    await getNotes().refresh()
    return note

});

// Copies leave reminders and sharing behind | someone else's labels stay with them
export const duplicateNote = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const stored = unwrap(await getNoteFor(id, locals.user.id), 'Note not found.')

    // COPY THE CONTENT
    const { title, body, color, pinned, archived } = stored
    const labels = await ownLabels(locals.user.id, stored.labels)
    let note = unwrap(await insertOnePartial('notes', { title, body, color, pinned, archived, labels, owner: locals.user.id }), 'Could not duplicate the note.')

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

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const stored = unwrap(await getNoteFor(id, locals.user.id), 'Note not found.')

    // Pin, archive and labels stay the owner's, the others edit only what the note says
    const update: Partial<Note> = { ...changes }
    if(stored.owner !== locals.user.id){
        delete update.pinned
        delete update.archived
        delete update.labels
    }
    else if(changes.labels) update.labels = await ownLabels(locals.user.id, changes.labels)
    const note = unwrap(await updateOnePartial('notes', id, update), 'Could not save the note.')

    await getNotes().refresh()
    return note

});

// A drag to a new place in a manual sort
export const moveNote = command(z.object({ id: idSchema, position: notePositionSchema }), async ({ id, position }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('notes', id, locals.user.id), 'Note not found.')
    unwrap(await updateOnePartial('notes', id, { position }), 'Could not move the note.')

    await getNotes().refresh()
    return true

});

// Adding goes through POST /api/notes/[id]/images, files don't fit through a command
export const removeImage = command(z.object({ id: idSchema, name: fileNameSchema }), async ({ id, name }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getNoteFor(id, locals.user.id), 'Note not found.')
    const note = unwrap(await removeNoteImage(id, name), 'Could not remove the image.')

    await getNotes().refresh()
    return note

});

// Its reminder goes with it through the cascade
export const deleteNote = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('notes', id, locals.user.id), 'Note not found.')
    unwrap(await deleteOne('notes', id), 'Could not delete the note.')

    await getNotes().refresh()
    return true

});



// SHARING ============================================================

// Only the owner picks who else sees the note | inactive accounts and the owner themself drop out
export const shareNote = command(z.object({ id: idSchema, people: z.array(idSchema).max(LIMITS.NOTE_SHARES, `A note can be shared with at most ${LIMITS.NOTE_SHARES} people.`) }), async ({ id, people }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('notes', id, locals.user.id), 'Note not found.')

    const owner = locals.user.id
    const active = new Set(unwrap(await getAll('users', { filter: 'state = "active"' }), 'Could not load people.').map((user) => user.id))
    const shared = [...new Set(people)].filter((person) => person !== owner && active.has(person))
    const note = unwrap(await updateOnePartial('notes', id, { shared }), 'Could not share the note.')

    await getNotes().refresh()
    return note

});

// Someone else's note disappears from the user's own list again
export const leaveNote = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const note = unwrap(await getNoteFor(id, locals.user.id), 'Note not found.')
    if(note.owner === locals.user.id) error(400, 'You own this note, delete it instead.')
    unwrap(await leave(id, locals.user.id), 'Could not leave the note.')

    await getNotes().refresh()
    return true

});



// HELPERS ============================================================

// Drops label ids of other users, a note may only point at its owner's labels
async function ownLabels(owner: string, ids: string[]): Promise<string[]> {
    if(!ids.length) return []
    const own = new Set(unwrap(await getAllOwned('labels', owner), 'Could not load labels.').map((label) => label.id))
    return [...new Set(ids)].filter((id) => own.has(id))
}
