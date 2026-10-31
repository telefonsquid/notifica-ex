import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// EVERYTHING IN (app) NEEDS A LOGIN
export const load = (async ({ locals }) => {
    if(!locals.user) redirect(303, '/login')
    return { user: locals.user }
}) satisfies LayoutServerLoad;
