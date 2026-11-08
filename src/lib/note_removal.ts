import { browser } from '$app/env';
import { resolve } from '$app/paths';
import { dropNotes, kept } from '#lib/note_list.ts';
import { dismiss, notify } from '#lib/notifications.svelte.ts';
import { removalQueue, type RemovedNote } from '#lib/removals.ts';
import { safeAction } from '#lib/safe_action.ts';
import type { Note } from '#lib/schemas/notes.ts';
import { SvelteSet } from 'svelte/reactivity';
import { removeNote, updateNote } from '../routes/api/notes.remote';

// Notes go at once and come with an Undo, the server only hears of it once the toast ends

const UNDO_TIME = 7000
const JUST_REMOVED = 'notes-just-removed'

// Hidden from the page while their toast is up
export const hiddenNotes = new SvelteSet<string>()

// A note the server refused comes back, the toast says why
const queue = removalQueue({
    hidden: hiddenNotes,
    toast(notes, me, undo, end){
        const owned = notes.filter((note) => note.owner === me).length
        const what = notes.length === 1 ? 'Note' : `${notes.length} notes`
        return notify(owned === notes.length ? `${what} deleted` : owned ? `${what} deleted or left` : `${what} left`, {
            type: 'info',
            duration: UNDO_TIME,
            action: { label: 'Undo', run: undo },
            onend: end
        })
    },
    dismiss,
    remove: (note) => safeAction(removeNote(note.id)),
    drop: (notes) => dropNotes(notes.map((note) => note.id)),
    send(notes){
        const ids = notes.map((note) => note.id)
        sessionStorage.setItem(JUST_REMOVED, JSON.stringify(ids))
        fetch(resolve('/api/notes/removals'), {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        })
    }
})

// A note shared with you is only left, it stays with its owner
export function removeNotes(notes: RemovedNote[], me: string){
    if(notes.length) queue.add(notes, me)
}

// Logging out ends the time for second thoughts
export const finishRemovals = () => queue.finishAll()

// A reload can read the list before the closing page's request is through, the notes stay hidden on the new page
if(browser){
    addEventListener('pagehide', queue.leave)
    addEventListener('pageshow', (event: PageTransitionEvent) => {
        if(!event.persisted) return
        sessionStorage.removeItem(JUST_REMOVED)
        queue.back()
    })
    for(const id of JSON.parse(sessionStorage.getItem(JUST_REMOVED) ?? '[]')) hiddenNotes.add(id)
    sessionStorage.removeItem(JUST_REMOVED)
}

// The notes as they were before an archive press go back on Undo
export function offerArchiveUndo(before: Pick<Note, 'id' | 'archived' | 'pinned'>[], archived: boolean){
    if(!before.length) return
    const what = before.length === 1 ? 'Note' : `${before.length} notes`
    notify(archived ? `${what} archived` : `${what} back from the archive`, {
        type: 'info',
        duration: UNDO_TIME,
        action: { label: 'Undo', run: () => {
            for(const { id, archived, pinned } of before) safeAction(kept(updateNote({ id, archived, pinned })))
        } }
    })
}
