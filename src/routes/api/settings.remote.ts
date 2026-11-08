import { getRequestEvent } from '$app/server';
import { isChoice, PREFERENCE_NAMES } from '#lib/preferences.ts';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { z } from 'zod';

// APPEARANCE ============================================================
const preferenceSchema = z.object({ name: z.enum(PREFERENCE_NAMES), value: z.string() }).refine(({ name, value }) => isChoice(name, value), 'Unknown choice.');

// Per device and readable without login, so the login page keeps the look too
export const setPreference = command(preferenceSchema, async ({ name, value }) => {
    getRequestEvent().cookies.set(name, value, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
});
