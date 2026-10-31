import { getRequestEvent } from '$app/server';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { THEME_COOKIE, themeNameSchema } from '#lib/themes/index.ts';

// APPEARANCE ============================================================
export const setTheme = command(themeNameSchema, async (theme) => {

    // STORE PER DEVICE | readable without login, so the login page keeps the theme too
    const event = getRequestEvent()
    event.cookies.set(THEME_COOKIE, theme, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
    return theme

});
