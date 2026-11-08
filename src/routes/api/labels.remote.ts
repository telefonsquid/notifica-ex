import { error } from '@sveltejs/kit';
import { lastPriority } from '#lib/auto_colors.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema } from '#lib/schemas/base.ts';
import { labelNameSchema, noteColorSchema } from '#lib/schemas/notes.ts';
import { deleteOne, getAllOwned, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { unwrap } from '#lib/server/result.ts';
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

export const updateLabel = command(z.object({ id: idSchema, name: labelNameSchema.optional(), color: noteColorSchema.optional(), autoColor: z.boolean().optional() }), async ({ id, ...changes }) => {

    const me = signedIn()
    const current = unwrap(await getOwned('labels', id, me.id), 'Label not found.')

    // Switched on, it joins the priority chart at the bottom
    const joining = changes.autoColor && !current.autoColor
    const place = joining ? { colorPriority: lastPriority(unwrap(await getAllOwned('labels', me.id), 'Could not load labels.')) + 1 } : {}

    const label = unwrap(await updateOnePartial('labels', id, { ...changes, ...place }), 'A label with that name already exists.')

    await getLabels().refresh()
    return label

});

// Takes every auto color label, highest priority first
export const reorderAutoColors = command(z.array(idSchema).max(LIMITS.AUTO_COLORS), async (ids) => {

    const me = signedIn()

    const labels = unwrap(await getAllOwned('labels', me.id), 'Could not load labels.')
    const auto = new Set(labels.filter((label) => label.autoColor).map((label) => label.id))
    if(ids.length !== auto.size || !ids.every((id) => auto.has(id))) error(400, 'Labels changed meanwhile, try again.')
    await Promise.all(ids.map((id, colorPriority) => updateOnePartial('labels', id, { colorPriority })))

    await getLabels().refresh()
    return true

});

// Pocketbase takes the id off every note that carried it
export const deleteLabel = command(idSchema, async (id) => {

    const me = signedIn()
    unwrap(await getOwned('labels', id, me.id), 'Label not found.')
    unwrap(await deleteOne('labels', id), 'Could not delete the label.')

    await Promise.all([getLabels().refresh(), getNotes().refresh()])
    return true

});
