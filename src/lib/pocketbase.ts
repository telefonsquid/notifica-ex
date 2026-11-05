import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import { notify } from '#lib/notifications.svelte.ts';
import { track } from '#lib/singletons/busy.svelte.ts';
import { checkServer } from '#lib/singletons/server_status.svelte.ts';
import PocketBase from 'pocketbase';

/*
    This looks like state scoped to one browser tab, but sveltekit modules are singletons, shared across all clients.
    Importing this connection into a .server.ts file would put its authStore into that shared instance, so one user's login could answer another user's request.
    Only use client side, NEVER import this into a .server.ts file or you will have a bad time.
*/
export const pb = new PocketBase(PUBLIC_POCKETBASE_URL);

export async function safeAction<T>(promise: Promise<T>): Promise<T | null> {
    try {
        const result = await track(promise); // Slow ones show the progress bar
        return result;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {

        // SERVER GONE | the banner says so, a toast per failed call would only pile up
        if((err?.status === undefined || err.status >= 500) && !(await checkServer())) return null;

        const message = err?.body?.message ?? err?.message ?? 'An unexpected error occurred.';
        notify(err?.body?.details ? `${message}
(${err.body.details})` : message, { type: 'error' });
        return null;
    }
}
