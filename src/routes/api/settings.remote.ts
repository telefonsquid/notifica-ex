import { getRequestEvent } from '$app/server';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { IMAGE_FIT_COOKIE, LABEL_POSITION_COOKIE, imageFitSchema, labelPositionSchema } from '#lib/preferences.ts';
import { THEME_COOKIE, themeNameSchema } from '#lib/themes/index.ts';

// APPEARANCE ============================================================

// Per device and readable without login, so the login page keeps the look too
function remember(cookie: string, value: string){
    getRequestEvent().cookies.set(cookie, value, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

export const setTheme = command(themeNameSchema, async (theme) => remember(THEME_COOKIE, theme));
export const setLabelPosition = command(labelPositionSchema, async (position) => remember(LABEL_POSITION_COOKIE, position));
export const setImageFit = command(imageFitSchema, async (fit) => remember(IMAGE_FIT_COOKIE, fit));
