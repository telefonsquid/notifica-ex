import { resolve } from '$app/paths';
import { noteLink } from '#lib/links.ts';
import { markdownToText } from '#lib/markdown.ts';
import type { Note } from '#lib/schemas/notes.ts';
import type { Occurrence } from '#lib/schemas/reminders.ts';
import { sign } from '#lib/server/server_auth.ts';

// One notification, the same on every channel | paths are relative, browser and app each know their server
export type Push = {
    id: string
    title: string
    message: string
    task: boolean
    cursor: string                  // Creation time of the occurrence, the phone resumes its stream from here
    click?: string                  // Opened on a tap
    done?: { path: string, signature: string }
    snooze?: { path: string, signature: string }    // Posted with the choice, see SnoozeChoice
}

export function pushFor(note: Note, task: boolean, occurrence: Occurrence | null): Push {
    const id = occurrence?.id ?? crypto.randomUUID()
    return {
        id,
        title: note.title || 'Reminder',
        message: markdownToText(note.body).slice(0, 500) || 'Time for this note.',
        task,
        cursor: occurrence?.created ?? '',
        click: noteLink(note.id),

        // Signed for this one occurrence, so it ticks off just that one however late it gets pressed
        done: task && occurrence ? { path: resolve('/api/occurrences/[id]/done', { id }), signature: sign(doneSubject(id)) } : undefined,
        snooze: occurrence ? { path: resolve('/api/occurrences/[id]/snooze', { id }), signature: sign(snoozeSubject(id)) } : undefined,
    }
}

export function doneSubject(occurrence: string){
    return `occurrence-done:${occurrence}`
}

export function snoozeSubject(occurrence: string){
    return `occurrence-snooze:${occurrence}`
}
