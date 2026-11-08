import { DEFAULT_LIMITS, effectiveLimits } from '#lib/limits.ts';
import type { FileLimits, User } from '#lib/schemas/users.ts';
import { findOne, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';

// One process, so what was read or saved here stays true | every page load asks for it
let known: FileLimits | null = null

// What counts for everyone without a limit of their own
export async function serverLimits() {
    if(known) return known

    const found = orNull(await findOne('app_settings', 'id != ""'), 'Could not read the limits.')
    if(!found) return DEFAULT_LIMITS // Nothing saved so far

    known = { ...DEFAULT_LIMITS, ...found.limits }
    return known
}

export async function limitsFor(user: Pick<User, 'limits'>) {
    return effectiveLimits(await serverLimits(), user.limits)
}

export async function saveServerLimits(limits: FileLimits) {
    const found = orNull(await findOne('app_settings', 'id != ""'), 'Could not save the limits.')
    const saved = found
        ? await updateOnePartial('app_settings', found.id, { limits })
        : await insertOnePartial('app_settings', { limits })
    unwrap(saved, 'Could not save the limits.')

    known = limits
    return limits
}
