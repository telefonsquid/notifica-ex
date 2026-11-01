import { getRequestEvent } from '$app/server';
import { unwrap } from '#lib/pocketbase.ts';
import { LIMITS, idSchema } from '#lib/schema_limits.ts';
import { viewChangesSchema, viewContentSchema, type View } from '#lib/schemas.ts';
import { deleteOne, getAllOwned, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { restrictAccess } from '#lib/user.ts';
import { readFilter, readSort, starterViews } from '#lib/views.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

// VIEWS ============================================================
// In rail order | an account without views gets the starter set, so there is always one
export const getViews = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')

    const owner = locals.user.id
    let views = await listViews(owner)
    if(!views.length){
        // A parallel request may create them first, the unique name index turns the second try into a no op
        await Promise.all(starterViews().map((view, position) => insertOnePartial('views', { ...view, position, owner })))
        views = await listViews(owner)
    }
    return views

});

async function listViews(owner: string): Promise<View[]> {
    const views = unwrap(await getAllOwned('views', owner, { sort: 'position,created' }), 'Could not load views.')
    return views.map((view) => ({ ...view, filter: readFilter(view.filter), sort: readSort(view.sort) }))
}

export const createView = command(viewContentSchema, async (content) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')

    const views = await listViews(locals.user.id)
    if(views.length >= LIMITS.VIEWS) error(400, `A maximum of ${LIMITS.VIEWS} views is allowed.`)

    const position = Math.max(-1, ...views.map((view) => view.position)) + 1
    const view = unwrap(await insertOnePartial('views', { ...content, position, owner: locals.user.id }), 'A view with that name already exists.')

    await getViews().refresh()
    return view

});

export const updateView = command(viewChangesSchema.extend({ id: idSchema }), async ({ id, ...changes }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('views', id, locals.user.id), 'View not found.')
    const view = unwrap(await updateOnePartial('views', id, changes), 'A view with that name already exists.')

    await getViews().refresh()
    return view

});

// The last view stays, the rail always needs somewhere to go
export const deleteView = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('views', id, locals.user.id), 'View not found.')

    const views = await listViews(locals.user.id)
    if(views.length <= 1) error(400, 'Keep at least one view.')
    unwrap(await deleteOne('views', id), 'Could not delete the view.')

    await getViews().refresh()
    return true

});

// Takes every view id in the new order
export const reorderViews = command(z.array(idSchema).max(LIMITS.VIEWS), async (ids) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')

    const owned = new Set((await listViews(locals.user.id)).map((view) => view.id))
    if(ids.length !== owned.size || !ids.every((id) => owned.has(id))) error(400, 'Views changed meanwhile, try again.')
    await Promise.all(ids.map((id, position) => updateOnePartial('views', id, { position })))

    await getViews().refresh()
    return true

});
