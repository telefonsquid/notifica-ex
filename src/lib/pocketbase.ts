import { PUBLIC_POCKETBASE_URL } from '$app/env/public';
import PocketBase from 'pocketbase';

/*
    This looks like state scoped to one browser tab, but sveltekit modules are singletons, shared across all clients.
    Importing this connection into a .server.ts file would put its authStore into that shared instance, so one user's login could answer another user's request.
    Only use client side, NEVER import this into a .server.ts file or you will have a bad time.
*/
export const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
