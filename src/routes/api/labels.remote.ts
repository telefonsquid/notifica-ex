import { getRequestEvent } from '$app/server';
import { unwrap } from '#lib/pocketbase.ts';
import { idSchema } from '#lib/schema_limits.ts';
import { labelNameSchema, noteColorSchema } from '#lib/schemas.ts';
import { deleteOne, getAllOwned, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { restrictAccess } from '#lib/user.ts';
import { z } from 'zod';
import { getNotes } from './notes.remote.ts';

// LABELS ============================================================
export const getLabels = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    return unwrap(await getAllOwned('labels', locals.user.id, { sort: 'name' }), 'Could not load labels.')

});

export const createLabel = command(z.object({ name: labelNameSchema, color: noteColorSchema }), async ({ name, color }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    const label = unwrap(await insertOnePartial('labels', { name, color, owner: locals.user.id }), 'A label with that name already exists.')

    await getLabels().refresh()
    return label

});

export const updateLabel = command(z.object({ id: idSchema, name: labelNameSchema.optional(), color: noteColorSchema.optional() }), async ({ id, ...changes }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('labels', id, locals.user.id), 'Label not found.')
    const label = unwrap(await updateOnePartial('labels', id, changes), 'A label with that name already exists.')

    await getLabels().refresh()
    return label

});

// Pocketbase takes the id off every note that carried it
export const deleteLabel = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    unwrap(await getOwned('labels', id, locals.user.id), 'Label not found.')
    unwrap(await deleteOne('labels', id), 'Could not delete the label.')

    await Promise.all([getLabels().refresh(), getNotes().refresh()])
    return true

});
