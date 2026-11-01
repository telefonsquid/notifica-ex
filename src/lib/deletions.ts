import { safeAction } from '#lib/pocketbase.ts';
import type { Label, Note, View } from '#lib/schemas.ts';
import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
import { deleteLabel } from '../routes/api/labels.remote';
import { deleteNote, leaveNote } from '../routes/api/notes.remote';
import { deleteView } from '../routes/api/views.remote';

/*
    Deletes that reach beyond the thing in front of you ask first, the same way from every place that offers them.
    Each resolves true once the record is gone.
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

// A note shared with you is only left, it stays with its owner
export function confirmNoteRemoval(count: number, owned: number){
    const leaving = owned === 0
    const what = count === 1 ? 'this note' : `${count} notes`
    return confirmAction({
        title: leaving ? `Leave ${what}?` : `Delete ${what}?`,
        message: leaving
            ? 'It disappears from your notes together with your reminders on it, and stays with its owner.'
            : owned < count
                ? 'Your own notes are gone for good, the ones shared with you stay with their owners.'
                : 'This can’t be undone, its images and reminders go with it.',
        action: leaving ? 'Leave' : 'Delete'
    })
}

// Asks once for the whole batch | resolves true once every note is gone or left
export async function removeNotes(notes: Note[], me: string){
    const owned = notes.filter((note) => note.owner === me).length
    if(!await confirmNoteRemoval(notes.length, owned)) return false
    await Promise.all(notes.map((note) => safeAction(note.owner === me ? deleteNote(note.id) : leaveNote(note.id))))
    return true
}
