import * as env from '$app/env/private';
import { getPbAdminConnection } from '#lib/server/pocketbase_admin_connection.ts';

export type ServerDetails = {
    pocketbase: string | null       // Null when the image predates the version hook or PocketBase is down
    ntfy: { state: 'off' | 'reachable' | 'unreachable', version: string | null }
}

// Route in pocketbase/cronjobs/about.pb.js
export const PB_VERSION_ROUTE = '/api/notifica/version'

// Both asked at once, a slow one must not hold up the page for long
export async function serverDetails(): Promise<ServerDetails> {
    const [pocketbase, ntfy] = await Promise.all([pocketbaseVersion(), ntfyState()])
    return { pocketbase, ntfy: { state: ntfy, version: env.NTFY_VERSION || null } }
}

async function pocketbaseVersion(): Promise<string | null> {
    try {
        const pb = await getPbAdminConnection()
        const answer = await pb.send<{ version: string | null }>(PB_VERSION_ROUTE, { signal: AbortSignal.timeout(3000) })
        return answer.version
    } catch {
        return null
    }
}

async function ntfyState(): Promise<ServerDetails['ntfy']['state']> {
    if(!env.NTFY_URL) return 'off'

    try {
        const response = await fetch(new URL('/v1/health', env.NTFY_URL), { signal: AbortSignal.timeout(3000) })
        return response.ok ? 'reachable' : 'unreachable'
    } catch {
        return 'unreachable'
    }
}
