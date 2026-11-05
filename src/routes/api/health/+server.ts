import { INTERNAL_POCKETBASE_URL } from '$app/env/private';
import { isOutage } from '#lib/server/outage.ts';
import type { RequestHandler } from './$types';

// Polled by the browser | fine only when the database answers too, see #lib/singletons/server_status.svelte.ts
export const GET = (async () => {
    const answer = await fetch(`${INTERNAL_POCKETBASE_URL}/api/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
    const down = !answer || isOutage(answer)
    return new Response(null, { status: down ? 503 : 204 })
}) satisfies RequestHandler;
