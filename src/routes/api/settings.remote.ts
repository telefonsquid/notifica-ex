import { getRequestEvent } from '$app/server';
import { isChoice, PREFERENCE_NAMES } from '#lib/preferences.ts';
import { noteColorSchema } from '#lib/schemas/notes.ts';
import { updateOnePartial } from '#lib/server/queries.ts';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { unwrap } from '#lib/server/result.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { z } from 'zod';

// APPEARANCE ============================================================
const preferenceSchema = z.object({ name: z.enum(PREFERENCE_NAMES), value: z.string() }).refine(({ name, value }) => isChoice(name, value), 'Unknown choice.');

// Per device and readable without login, so the login page keeps the look too
export const setPreference = command(preferenceSchema, async ({ name, value }) => {
    getRequestEvent().cookies.set(name, value, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
});

// Follows the account to every device, unlike the look above
export const setNoteColor = command(noteColorSchema, async (color) => {
    const me = signedIn()
    unwrap(await updateOnePartial('users', me.id, { noteColor: color }), 'Could not save the color.')
    return true
});
