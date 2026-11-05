import { getRequestEvent } from '$app/server';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { IMAGE_FITS, IMAGE_FIT_COOKIE, LABEL_POSITIONS, LABEL_POSITION_COOKIE } from '#lib/preferences.ts';
import { THEMES, THEME_COOKIE, type ThemeName } from '#lib/themes/index.ts';
import { z } from 'zod';

// APPEARANCE ============================================================

// Per device and readable without login, so the login page keeps the look too
function remember(cookie: string, value: string){
    getRequestEvent().cookies.set(cookie, value, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

export const setTheme = command(z.enum(THEMES.map((theme) => theme.name) as [ThemeName, ...ThemeName[]]), async (theme) => remember(THEME_COOKIE, theme));
export const setLabelPosition = command(z.enum(LABEL_POSITIONS), async (position) => remember(LABEL_POSITION_COOKIE, position));
export const setImageFit = command(z.enum(IMAGE_FITS), async (fit) => remember(IMAGE_FIT_COOKIE, fit));
