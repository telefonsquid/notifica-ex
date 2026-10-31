import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
    return {
        user: locals.user,
        theme: locals.theme,
        labelPosition: locals.labelPosition,

        // REALTIME TOKEN | the cookie stays httpOnly, the browser only gets the token to subscribe with, see #lib/realtime
        realtimeToken: locals.user ? locals.pb.authStore.token : undefined,
    }
}) satisfies LayoutServerLoad;
