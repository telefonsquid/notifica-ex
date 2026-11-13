import { sharedContent } from '#lib/notes.ts';
import { noteContentSchema } from '#lib/schemas/notes.ts';
import { keyHolder } from '#lib/server/stream_key.ts';
import { insertOnePartial } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const sharedSchema = z.object({
    title: z.string().default(''),
    text: z.string().default(''),
})

// What another app shared on the phone becomes a note without opening the app | the images follow one by one
export const POST: RequestHandler = async ({ params, url, request }) => {

    // VERIFY
    const user = await keyHolder(params.user, url.searchParams.get('key') ?? '')
    const shared = sharedSchema.safeParse(await request.json().catch(() => null))
    if(!shared.success) error(400, 'Malformed request.')

    // STORE
    const content = noteContentSchema.parse({ title: '', body: '', color: '', labels: [], pinned: false, archived: false, ...sharedContent(shared.data.title, shared.data.text) })
    const note = unwrap(await insertOnePartial('notes', { ...content, owner: user.id }), 'Could not save the note.')
    return json({ id: note.id })

}
