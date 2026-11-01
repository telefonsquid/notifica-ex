import { getRequestEvent } from '$app/server';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { IMAGE_FIT_COOKIE, LABEL_POSITION_COOKIE, imageFitSchema, labelPositionSchema } from '#lib/preferences.ts';
import { THEME_COOKIE, themeNameSchema } from '#lib/themes/index.ts';

// APPEARANCE ============================================================
export const setTheme = command(themeNameSchema, async (theme) => {

    // STORE PER DEVICE | readable without login, so the login page keeps the theme too
    const event = getRequestEvent()
    event.cookies.set(THEME_COOKIE, theme, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
    return theme

});

export const setLabelPosition = command(labelPositionSchema, async (position) => {

    // STORE PER DEVICE | same as the theme
    const event = getRequestEvent()
    event.cookies.set(LABEL_POSITION_COOKIE, position, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
    return position

});

export const setImageFit = command(imageFitSchema, async (fit) => {

    // STORE PER DEVICE | same as the theme
    const event = getRequestEvent()
    event.cookies.set(IMAGE_FIT_COOKIE, fit, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
    return fit

});
