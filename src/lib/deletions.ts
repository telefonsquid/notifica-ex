import { browser } from '$app/env';
import { keepEvents, kept } from '#lib/note_list.ts';
import { dismiss, notify } from '#lib/notifications.svelte.ts';
import { safeAction } from '#lib/pocketbase.ts';
import { removalQueue, type RemovedNote } from '#lib/removals.ts';
import type { Label, Note, View } from '#lib/schemas.ts';
import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
import { deleteLabel } from '../routes/api/labels.remote';
import { SvelteSet } from 'svelte/reactivity';
import { deleteNote, leaveNote, updateNote } from '../routes/api/notes.remote';
import { deleteView } from '../routes/api/views.remote';

/*
    Deletes that reach beyond the thing in front of you ask first, the same way from every place that offers them.
    Notes go at once and come with an Undo instead, the server only hears of it once the toast ends.
*/

export async function deleteLabelEverywhere(label: Label){
    const confirmed = await confirmAction({
        title: `Delete ${label.name}?`,
        message: 'The label comes off every note that carries it. The notes themselves stay.',
        action: 'Delete label'
    })
    return confirmed && !!await safeAction(deleteLabel(label.id))
}

export async function deleteSavedView(view: View){
    const confirmed = await confirmAction({
        title: `Delete ${view.name}?`,
        message: 'Only the saved filter and sort go, every note stays where it is.',
        action: 'Delete view'
    })
    return confirmed && !!await safeAction(deleteView(view.id))
}




// NOTES ============================================================
const UNDO_TIME = 7000
const JUST_REMOVED = 'notes-just-removed'

// Hidden from the page while their toast is up
export const hiddenNotes = new SvelteSet<string>()

// Gone already, deleted elsewhere or no longer shared, is what was asked for
async function removed(asked: Promise<boolean>){
    try{
        return await asked
    }catch(err){
        if((err as { status?: number })?.status === 404) return true
        throw err
    }
}

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
    remove: (note, me) => safeAction(removed(note.owner === me ? deleteNote(note.id) : leaveNote(note.id))),
    drop: (notes) => keepEvents(notes.map((note) => ({ action: 'delete', record: note as Note }))),
    send(notes){
        const ids = notes.map((note) => note.id)
        sessionStorage.setItem(JUST_REMOVED, JSON.stringify(ids))
        fetch('/api/notes/removals', {
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
