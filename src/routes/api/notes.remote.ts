import { getRequestEvent } from '$app/server';
import { unwrap } from '#lib/pocketbase.ts';
import { idSchema } from '#lib/schema_limits.ts';
import { noteContentSchema, type Note } from '#lib/schemas.ts';
import { deleteOne, getAllOwned, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { restrictAccess } from '#lib/user.ts';

// NOTES ============================================================
export const getNotes = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    return unwrap(await getAllOwned('notes', locals.user.id, { sort: '-pinned,-updated' }), 'Could not load notes.')

});

export const createNote = command(noteContentSchema, async (content) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')

    const labels = await ownLabels(locals.user.id, content.labels)
    const note = unwrap(await insertOnePartial('notes', { ...content, labels, owner: locals.user.id }), 'Could not save the note.')

    await getNotes().refresh()
    return note

});

export const updateNote = command(noteContentSchema.partial().extend({ id: idSchema }), async ({ id, ...changes }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('notes', id, locals.user.id), 'Note not found.')

    const update: Partial<Note> = { ...changes }
    if(changes.labels) update.labels = await ownLabels(locals.user.id, changes.labels)
    const note = unwrap(await updateOnePartial('notes', id, update), 'Could not save the note.')

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



// HELPERS ============================================================

// Drops label ids of other users, a note may only point at its owner's labels
async function ownLabels(owner: string, ids: string[]): Promise<string[]> {
    if(!ids.length) return []
    const own = new Set(unwrap(await getAllOwned('labels', owner), 'Could not load labels.').map((label) => label.id))
    return [...new Set(ids)].filter((id) => own.has(id))
}
