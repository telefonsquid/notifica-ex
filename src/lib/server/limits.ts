import { DEFAULT_LIMITS, effectiveLimits, type FileLimits } from '#lib/limits.ts';
import type { User } from '#lib/schemas.ts';
import { findOne, insertOnePartial, unwrap, updateOnePartial } from '#lib/server/queries.ts';

// One process, so what was read or saved here stays true | every page load asks for it
let known: FileLimits | null = null

// What counts for everyone without a limit of their own
export async function serverLimits() {
    if(known) return known

    const found = await findOne('app_settings', 'id != ""')
    if(!found.success) return DEFAULT_LIMITS // Nothing saved so far

    known = { ...DEFAULT_LIMITS, ...found.data.limits }
    return known
}

export async function limitsFor(user: Pick<User, 'limits'>) {
    return effectiveLimits(await serverLimits(), user.limits)
}

export async function saveServerLimits(limits: FileLimits) {
    const found = await findOne('app_settings', 'id != ""')
    const saved = found.success
        ? await updateOnePartial('app_settings', found.data.id, { limits })
        : await insertOnePartial('app_settings', { limits })
    unwrap(saved, 'Could not save the limits.')

    known = limits
    return limits
}
