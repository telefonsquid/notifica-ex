import { resolve } from '$app/paths';
import { noteLink, rescheduleLink } from '#lib/links.ts';
import { markdownToText } from '#lib/markdown.ts';
import { parseTimestamp } from '#lib/reminders.ts';
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
    slot?: string                   // Reminder and time, the phone shows each once whether its alarm or the stream got there first
    click?: string                  // Opened on a tap
    done?: { path: string, signature: string }
    snooze?: { path: string, signature: string }    // Posted with the choice, see SnoozeChoice
    reschedule?: string             // Opens the note with every choice, the Android app's one button for it
}

// What a phone sets an alarm for, before the server logged it
export type ScheduledPush = Push & { at: string }

export function pushFor(note: Note, task: boolean, occurrence: Occurrence | null): Push {
    const id = occurrence?.id ?? crypto.randomUUID()
    const at = parseTimestamp(occurrence?.at)
    return {
        ...content(note, task),
        id,
        cursor: occurrence?.created ?? '',
        slot: occurrence?.reminder && at ? slotOf(occurrence.reminder, at) : undefined,

        // Signed for this one occurrence, so it ticks off just that one however late it gets pressed
        done: task && occurrence ? { path: resolve('/api/occurrences/[id]/done', { id }), signature: sign(doneSubject(id)) } : undefined,
        snooze: occurrence ? { path: resolve('/api/occurrences/[id]/snooze', { id }), signature: sign(snoozeSubject(id)) } : undefined,
        reschedule: occurrence ? rescheduleLink(note.id, id) : undefined,
    }
}

// Signed for the reminder and its time | the occurrence may not exist yet when the alarm goes off
export function scheduledPushFor(note: Note, task: boolean, reminder: string, at: Date): ScheduledPush {
    const slot = slotOf(reminder, at)
    const params = { id: reminder, at: String(at.getTime()) }
    return {
        ...content(note, task),
        id: slot,
        cursor: '',
        slot,
        at: at.toISOString(),
        done: task ? { path: resolve('/api/reminders/[id]/at/[at]/done', params), signature: sign(doneAtSubject(reminder, at)) } : undefined,
        snooze: { path: resolve('/api/reminders/[id]/at/[at]/snooze', params), signature: sign(snoozeAtSubject(reminder, at)) },
        reschedule: rescheduleLink(note.id, slot),
    }
}

function content(note: Note, task: boolean) {
    return {
        title: note.title || 'Reminder',
        message: markdownToText(note.body).slice(0, 500),  // Empty stays empty, no filler text
        task,
        click: noteLink(note.id),
    }
}



// SLOTS AND SIGNED SUBJECTS ===================================================================================

// Record ids never hold an @, so the two halves split cleanly
export function slotOf(reminder: string, at: Date) {
    return `${reminder}@${at.getTime()}`
}

export function parseSlot(slot: string): { reminder: string, at: Date } | null {
    const match = /^([\w-]+)@(\d{1,15})$/.exec(slot)
    return match ? { reminder: match[1], at: new Date(Number(match[2])) } : null
}

export function doneSubject(occurrence: string){
    return `occurrence-done:${occurrence}`
}

export function snoozeSubject(occurrence: string){
    return `occurrence-snooze:${occurrence}`
}

export function doneAtSubject(reminder: string, at: Date){
    return `reminder-done:${slotOf(reminder, at)}`
}

export function snoozeAtSubject(reminder: string, at: Date){
    return `reminder-snooze:${slotOf(reminder, at)}`
}
