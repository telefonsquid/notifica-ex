import { apiKeyInputSchema } from '#lib/schemas/api_keys.ts';
import { idSchema } from '#lib/schemas/base.ts';
import { createKey, listKeys, revokeKey } from '#lib/server/api_keys.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';

// API KEYS ============================================================
export const getApiKeys = query(async () => {

    const me = signedIn()
    return listKeys(me.id)

});

// The key itself comes back only here, once
export const createApiKey = command(apiKeyInputSchema, async (input) => {

    const me = signedIn()
    const created = await createKey(me, input)

    await getApiKeys().refresh()
    return created

});

export const revokeApiKey = command(idSchema, async (id) => {

    const me = signedIn()
    await revokeKey(id, me.id)

    await getApiKeys().refresh()

});
