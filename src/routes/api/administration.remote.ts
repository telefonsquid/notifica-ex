import z from 'zod';
import { usedBytes, type LimitOverrides } from '#lib/limits.ts';
import { defaultLimitChangesSchema, idSchema, userLimitChangesSchema } from '#lib/schemas.ts';
import { saveServerLimits, serverLimits } from '#lib/server/limits.ts';
import { getAll, getOne, unwrap, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';

// The limits that count for everyone, and each account with what it holds
export const getAdministration = query(async () => {

    signedIn('admin')

    const users = unwrap(await getAll('users', { sort: 'name', fields: 'id,name,email,state,limits' }), 'Could not load users.')
    const notes = unwrap(await getAll('notes', { fields: 'owner,fileInfo' }), 'Could not read the storage in use.')

    const used = new Map<string, number>()
    for(const note of notes) used.set(note.owner, (used.get(note.owner) ?? 0) + usedBytes([note]))

    return {
        defaults: await serverLimits(),
        users: users.map(({ id, name, email, state, limits }) => ({ id, name, email, state, limits, used: used.get(id) ?? 0 }))
    }

});

export const saveDefaultLimits = command(defaultLimitChangesSchema, async (changes) => {

    signedIn('admin')

    await saveServerLimits({ ...await serverLimits(), ...changes })
    await getAdministration().refresh()
    return true

});

// A null takes that limit back to the default
export const saveUserLimits = command(z.object({ id: idSchema, limits: userLimitChangesSchema }), async ({ id, limits }) => {

    signedIn('admin')

    const user = unwrap(await getOne('users', id), 'User not found.')
    const merged: Record<string, unknown> = { ...user.limits }
    for(const [key, value] of Object.entries(limits)){
        if(value === null) delete merged[key]
        else merged[key] = value
    }

    const kept = Object.keys(merged).length ? merged as LimitOverrides : null
    unwrap(await updateOnePartial('users', id, { limits: kept }), 'Could not save the limits.')
    await getAdministration().refresh()
    return true

});
