import { mergeNotes, type NoteEvent } from '#lib/notes.ts';
import type { Note } from '#lib/schemas.ts';
import { getNotes } from '../routes/api/notes.remote';

/*
    The list of notes the page shows, patched in place. Reading it fresh would send every note again.
*/

// Realtime events and answers from the server | without a page showing the list there is nothing to patch
export function keepEvents(events: NoteEvent[]){
    const list = getNotes().current
    if(list) getNotes().set(mergeNotes(list, events))
}

// Wrap a command that answers with its note
export async function kept(saving: Promise<Note>): Promise<Note> {
    const note = await saving
    keepEvents([{ action: 'update', record: note }])
    return note
}
