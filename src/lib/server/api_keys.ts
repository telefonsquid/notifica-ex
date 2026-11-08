import { LIMITS } from '#lib/schema_limits.ts';
import type { ApiKey, ApiKeyScope, ApiKeySummary } from '#lib/schemas/api_keys.ts';
import type { User } from '#lib/schemas/users.ts';
import { limitsFor } from '#lib/server/limits.ts';
import { deleteOne, findOne, getAllOwned, getOne, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { error } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';

/*
    Keys that let a program act as one person, i.e. an AI through the MCP server. Only a hash
    is stored, the key itself is shown once when it is made.
*/

const KEY_START = 'nex_'
const PREFIX_LENGTH = KEY_START.length + 6
const SUMMARY_FIELDS = 'id,name,prefix,scope,expires,lastUsed,created'

// Keys carry 256 random bits, a plain hash is enough to keep them safe at rest
function hashOf(key: string) {
    return createHash('sha256').update(key).digest('hex')
}



// MANAGING ===================================================================================================
export async function listKeys(owner: string) {
    return unwrap(await getAllOwned('api_keys', owner, { sort: '-created', fields: SUMMARY_FIELDS }), 'Could not load the keys.') as ApiKeySummary[]
}

export async function createKey(owner: User, input: { name: string, scope: ApiKeyScope, days: number | null }) {
    if(!(await limitsFor(owner)).aiAccess) error(403, 'API keys are turned off for this account.')
    if((await listKeys(owner.id)).length >= LIMITS.API_KEYS) error(400, `An account holds at most ${LIMITS.API_KEYS} keys.`)

    const key = KEY_START + randomBytes(32).toString('base64url')
    const expires = input.days ? new Date(Date.now() + input.days * 24 * 60 * 60 * 1000).toISOString() : ''
    const stored = unwrap(await insertOnePartial('api_keys', { owner: owner.id, name: input.name, scope: input.scope, expires, prefix: key.slice(0, PREFIX_LENGTH), hash: hashOf(key) }), 'Could not create the key.')

    return { key, summary: summaryOf(stored) }
}

export async function revokeKey(id: string, owner: string) {
    unwrap(await getOwned('api_keys', id, owner), 'Key not found.')
    unwrap(await deleteOne('api_keys', id), 'Could not revoke the key.')
}

function summaryOf({ id, name, prefix, scope, expires, lastUsed, created }: ApiKey): ApiKeySummary {
    return { id, name, prefix, scope, expires, lastUsed, created }
}



// CHECKING ===================================================================================================

// Wrong, expired, revoked, a deactivated owner or AI access turned off all look alike to the caller
export async function userForKey(key: string): Promise<{ user: User, scope: ApiKeyScope } | null> {
    if(!key.startsWith(KEY_START)) return null

    const found = orNull(await findOne('api_keys', 'hash = {:hash}', undefined, { hash: hashOf(key) }), 'Could not check the key.')
    if(!found || (found.expires && new Date(found.expires) <= new Date())) return null

    const user = orNull(await getOne('users', found.owner), 'Could not check the key.')
    if(!user || user.state !== 'active' || !(await limitsFor(user)).aiAccess) return null

    await markUsed(found)
    return { user, scope: found.scope }
}

// Once a minute is plenty for the list, an AI calls in bursts
async function markUsed(key: ApiKey) {
    const last = key.lastUsed ? new Date(key.lastUsed).getTime() : 0
    if(Date.now() - last < 60 * 1000) return
    await updateOnePartial('api_keys', key.id, { lastUsed: new Date().toISOString() })
}
