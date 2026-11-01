import { getRequestEvent } from '$app/server';
import { idSchema } from '#lib/schema_limits.ts';
import { imageNameSchema, noteContentSchema, userBaseSchema, type Note } from '#lib/schemas.ts';
import { addImages, deleteOne, fetchImage, findActiveUser, getAllOwned, getNoteOf, getNotesOf, getPeople as fetchPeople, insertOnePartial, removeImage, unwrap, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { restrictAccess } from '#lib/user.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

// NOTES ============================================================
// Own ones and the ones shared with this user
export const getNotes = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    return unwrap(await getNotesOf(locals.user.id, { sort: '-pinned,-updated' }), 'Could not load notes.')

});

export const createNote = command(noteContentSchema, async (content) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')

    const labels = await ownLabels(locals.user.id, content.labels)
    const note = unwrap(await insertOnePartial('notes', { ...content, labels, owner: locals.user.id }), 'Could not save the note.')

    await getNotes().refresh()
    return note

});

// A copy of the user's own, images included | reminders and sharing stay with the original
export const duplicateNote = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const original = unwrap(await getNoteOf(id, locals.user.id), 'Note not found.')

    const { title, body, color, pinned, archived } = original
    const labels = await ownLabels(locals.user.id, original.labels)
    let copy = unwrap(await insertOnePartial('notes', { title, body, color, labels, pinned, archived, owner: locals.user.id }), 'Could not copy the note.')

    if(original.images.length){
        const files = await Promise.all(original.images.map((file) => imageFile(original, file)))
        copy = unwrap(await addImages(copy.id, files), 'The note was copied, but its images could not be.')
    }

    await getNotes().refresh()
    return copy

});

// Everyone it is shared with may edit it
export const updateNote = command(noteContentSchema.partial().extend({ id: idSchema }), async ({ id, ...changes }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const existing = await getNoteOf(id, locals.user.id)
    if(!existing.success) error(404, 'Note not found.') // gone meanwhile, the open note tells its writer

    const update: Partial<Note> = { ...changes }
    if(changes.labels) update.labels = await mergeLabels(locals.user.id, existing.data.labels, changes.labels)
    const note = unwrap(await updateOnePartial('notes', id, update), 'Could not save the note.')

    await getNotes().refresh()
    return note

});

// The owner deletes it for everyone, its reminders go with it through the cascade | anyone else only leaves it
export const deleteNote = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const me = locals.user.id
    const note = unwrap(await getNoteOf(id, me), 'Note not found.')

    if(note.owner === me) unwrap(await deleteOne('notes', id), 'Could not delete the note.')
    else unwrap(await updateOnePartial('notes', id, { sharedWith: note.sharedWith.filter((person) => person !== me) }), 'Could not leave the note.')

    await getNotes().refresh()
    return true

});



// SHARING ============================================================
// Everyone this user shares notes with, or gets them from
export const getPeople = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')

    const notes = unwrap(await getNotesOf(locals.user.id, { fields: 'owner,sharedWith' }), 'Could not load notes.')
    const ids = new Set(notes.flatMap((note) => [note.owner, ...note.sharedWith]))
    ids.delete(locals.user.id)
    return unwrap(await fetchPeople([...ids]), 'Could not load the people notes are shared with.')

});

// Only the owner invites, by the email of an active account
export const shareNote = command(z.object({ id: idSchema, email: userBaseSchema.shape.email }), async ({ id, email }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const note = unwrap(await getNoteOf(id, locals.user.id), 'Note not found.')
    if(note.owner !== locals.user.id) error(403, 'Only the owner can share this note.')

    const person = await findActiveUser(email)
    if(!person.success) error(404, 'Nobody here uses that email.')
    if(person.data.id === locals.user.id) error(400, 'This note is yours already.')
    if(note.sharedWith.includes(person.data.id)) error(400, `${person.data.name || email} has it already.`)

    unwrap(await updateOnePartial('notes', id, { sharedWith: [...note.sharedWith, person.data.id] }), 'Could not share the note.')

    await Promise.all([getNotes().refresh(), getPeople().refresh()])
    return { id: person.data.id, name: person.data.name, email: person.data.email }

});

// The owner takes anyone off, everyone else only themselves
export const unshareNote = command(z.object({ id: idSchema, person: idSchema }), async ({ id, person }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const note = unwrap(await getNoteOf(id, locals.user.id), 'Note not found.')
    if(note.owner !== locals.user.id && person !== locals.user.id) error(403, 'Only the owner can take others off this note.')

    unwrap(await updateOnePartial('notes', id, { sharedWith: note.sharedWith.filter((item) => item !== person) }), 'Could not change who sees the note.')

    await getNotes().refresh()
    return true

});



// IMAGES ============================================================
// Uploads go through /api/notes/[id]/images, removing one is a plain command
export const removeNoteImage = command(z.object({ id: idSchema, file: imageNameSchema }), async ({ id, file }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getNoteOf(id, locals.user.id), 'Note not found.')
    unwrap(await removeImage(id, file), 'Could not remove the image.')

    await getNotes().refresh()
    return true

});



// HELPERS ============================================================

// The stored image as a file again, to go on another note
async function imageFile(note: Note, file: string): Promise<File> {
    const response = await fetchImage(note, file)
    if(!response.ok) error(502, 'Could not read an image of the note.')
    return new File([await response.blob()], file, { type: response.headers.get('content-type') ?? undefined })
}

// A new note only carries labels of the one who wrote it
async function ownLabels(owner: string, ids: string[]): Promise<string[]> {
    if(!ids.length) return []
    const own = await ownLabelIds(owner)
    return [...new Set(ids)].filter((id) => own.has(id))
}

// On a shared note everyone keeps their own labels | the labels of others stay as they were, whatever got sent
async function mergeLabels(user: string, existing: string[], sent: string[]): Promise<string[]> {
    const own = await ownLabelIds(user)
    const others = existing.filter((id) => !own.has(id))
    return [...others, ...new Set(sent.filter((id) => own.has(id)))]
}

async function ownLabelIds(owner: string): Promise<Set<string>> {
    return new Set(unwrap(await getAllOwned('labels', owner), 'Could not load labels.').map((label) => label.id))
}
