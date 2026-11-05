import { idSchema, labelNameSchema, noteColorSchema } from '#lib/schemas.ts';
import { deleteOne, getAllOwned, getOwned, insertOnePartial, unwrap, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { z } from 'zod';
import { getNotes } from './notes.remote.ts';

// LABELS ============================================================
export const getLabels = query(async () => {

    const me = signedIn()
    return unwrap(await getAllOwned('labels', me.id, { sort: 'name' }), 'Could not load labels.')

});

export const createLabel = command(z.object({ name: labelNameSchema, color: noteColorSchema }), async ({ name, color }) => {

    const me = signedIn()
    const label = unwrap(await insertOnePartial('labels', { name, color, owner: me.id }), 'A label with that name already exists.')

    await getLabels().refresh()
    return label

});

export const updateLabel = command(z.object({ id: idSchema, name: labelNameSchema.optional(), color: noteColorSchema.optional() }), async ({ id, ...changes }) => {

    const me = signedIn()
    unwrap(await getOwned('labels', id, me.id), 'Label not found.')
    const label = unwrap(await updateOnePartial('labels', id, changes), 'A label with that name already exists.')

    await getLabels().refresh()
    return label

});

// Pocketbase takes the id off every note that carried it
export const deleteLabel = command(idSchema, async (id) => {

    const me = signedIn()
    unwrap(await getOwned('labels', id, me.id), 'Label not found.')
    unwrap(await deleteOne('labels', id), 'Could not delete the label.')

    await Promise.all([getLabels().refresh(), getNotes().refresh()])
    return true

});
