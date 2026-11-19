import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema } from '#lib/schemas/base.ts';
import { noteContentSchema } from '#lib/schemas/notes.ts';
import { requireOwnNote } from '#lib/server/note_access.ts';
import { guestView, removeLinked, requireNoteByLink, setLink } from '#lib/server/note_links.ts';
import { updateOnePartial } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getPeople } from './users.remote';

const tokenSchema = z.string().min(1).max(LIMITS.NOTE_LINK_TOKEN)
const modeSchema = z.enum(['', 'read', 'write'])

// OWNER ============================================================
export const getNoteLink = query(idSchema, async (id) => {

    const me = signedIn()
    const note = await requireOwnNote(id, me.id)
    return { mode: note.linkMode, token: note.linkToken ?? '' }

});

export const setNoteLink = command(z.object({ id: idSchema, mode: modeSchema, renew: z.boolean().default(false) }), async ({ id, mode, renew }) => {

    const me = signedIn()
    const note = await setLink(await requireOwnNote(id, me.id), mode, renew)

    await getNoteLink(id).refresh()
    return note

});

// They lose the note, the link itself stays as it is
export const dropLinked = command(z.object({ id: idSchema, person: idSchema }), async ({ id, person }) => {

    const me = signedIn()
    const note = await removeLinked(await requireOwnNote(id, me.id), person)

    await getPeople().refresh()
    return note

});



// GUESTS ============================================================
// No account needed, the link is the key | title and text only, everything else asks for an account

export const getLinkedNote = query(tokenSchema, async (token) => {

    const { note, owner } = await requireNoteByLink(token)
    return guestView(note, owner)

});

// Refused once someone else saved in between | the page reloads instead of overwriting their words
export const saveLinkedNote = command(z.object({ token: tokenSchema, title: noteContentSchema.shape.title, body: noteContentSchema.shape.body, base: z.string().max(40) }), async ({ token, title, body, base }) => {

    const { note, owner } = await requireNoteByLink(token)
    if(note.linkMode !== 'write') error(403, 'This link only shows the note.')
    if(note.sealed) error(409, 'This note is locked.')
    if(note.updated !== base) error(409, 'The note changed meanwhile, reload the page to see the new version.')

    const saved = unwrap(await updateOnePartial('notes', note.id, { title, body }), 'Could not save the note.')
    return guestView(saved, owner)

});
