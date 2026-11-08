import { getRequestEvent } from '$app/server';
import { loginInputSchema, type User } from '#lib/schemas/users.ts';
import { login } from '#lib/server/accounts.ts';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { unwrap } from '#lib/server/result.ts';
import { error } from '@sveltejs/kit';

// SESSION ============================================================
export const loginUser = command(loginInputSchema, async ({ email, password }) => {

    // LOGIN | the request hook exports the new auth as a cookie
    const event = getRequestEvent()
    const auth = unwrap(await login(email, password), 'Wrong email or password.')
    const user = structuredClone(auth.record) as User

    // REJECT DEACTIVATED USERS | checked after the password so the form can't probe for accounts
    if(user.state === 'inactive'){
        event.locals.pb.authStore.clear()
        error(403, 'This account is deactivated.')
    }

    event.locals.user = user
    return user

});

export const logoutUser = command(async () => {

    const event = getRequestEvent()
    event.locals.pb.authStore.clear()
    event.locals.user = undefined
    return true;

});
