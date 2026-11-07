import { loginPath } from '#lib/return_path.ts';
import { limitsFor } from '#lib/server/limits.ts';
import { outage } from '#lib/server/outage.ts';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// EVERYTHING IN (app) NEEDS A LOGIN | the login comes back here afterwards
export const load = (async ({ locals, url, untrack }) => {
    if(locals.serverDown) outage() // Thrown here so the root layout still renders the error page
    if(!locals.user) redirect(303, untrack(() => loginPath(url))) // untracked, a new url alone must not rerun this load
    return { user: locals.user, limits: await limitsFor(locals.user) }
}) satisfies LayoutServerLoad;
