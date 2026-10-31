import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// ALREADY LOGGED IN USERS GO STRAIGHT TO THEIR NOTES
export const load = (async ({ locals }) => {
    if(locals.user) redirect(303, '/')
}) satisfies PageServerLoad;
