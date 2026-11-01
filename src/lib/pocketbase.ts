import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import { notify } from '#lib/notifications.svelte.ts';
import type { Result } from '#lib/server/queries.ts';
import { error } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

/*
    This looks like state scoped to one browser tab, but sveltekit modules are singletons, shared across all clients.
    Importing this connection into a .server.ts file would put its authStore into that shared instance, so one user's login could answer another user's request.
    Only use client side, NEVER import this into a .server.ts file or you will have a bad time.
*/
export const pb = new PocketBase(PUBLIC_POCKETBASE_URL);

export async function safeAction<T>(promise: Promise<T>): Promise<T | null> {
    try {
        const result = await promise;
        return result;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {

        // CUSTOM DETAILS OBJECT ATTACHED TO ERROR
        if(err?.body?.message && err?.body?.details){
            notify(`${err.body.message}\n(${err.body.details})`, { type: 'error' });
        }
        // STANDARD SVELTEKIT HTTP ERRORS
        else if(err?.body?.message){
            notify(err.body.message, { type: 'error' });
        }
        // BROWSER/NETWORK ERRORS
        else if(err?.message){
            notify(err.message, { type: 'error' });
        }
        // FALLBACK
        else {
            notify('An unexpected error occurred.', { type: 'error' });
        }

        return null;
    }
}

export function unwrap<T>(result: Result<T>, fallbackMessage?: string): NonNullable<T> {
    if(!result.success || !result.data){
        console.error(result)
        error(400, {
            message: fallbackMessage ?? result.error ?? 'Unknown Error',
            ...(result.error ? { details: result.error } : {})
        });
    }
    return result.data as NonNullable<T>;
}
