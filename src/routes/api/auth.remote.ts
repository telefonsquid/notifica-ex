import { getRequestEvent } from '$app/server';
import { loginInputSchema } from '#lib/schemas/users.ts';
import { enter, login } from '#lib/server/accounts.ts';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { unwrap } from '#lib/server/result.ts';

// SESSION ============================================================
export const loginUser = command(loginInputSchema, async ({ email, password }) => {

    // REJECT DEACTIVATED USERS ONLY AFTER THE PASSWORD | so the form can't probe for accounts
    const event = getRequestEvent()
    unwrap(await login(email, password), 'Wrong email or password.')
    return enter(event)

});

export const logoutUser = command(async () => {

    const event = getRequestEvent()
    event.locals.pb.authStore.clear()
    event.locals.user = undefined
    return true;

});
