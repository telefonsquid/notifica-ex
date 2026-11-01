import { returnPath } from '#lib/return_path.ts';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// ALREADY LOGGED IN USERS GO STRAIGHT WHERE THEY WERE HEADED
export const load = (async ({ locals, url }) => {
    if(locals.user) redirect(303, returnPath(url))
}) satisfies PageServerLoad;
