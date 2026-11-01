import { ORIGIN } from '$app/env/private';
import { markdownToText } from '#lib/markdown.ts';
import { occurrenceAfter, parseTimestamp } from '#lib/reminders.ts';
import type { Note, Reminder, User } from '#lib/schemas.ts';
import { publish, type NtfyMessage } from '#lib/server/ntfy.ts';
import { getDueReminders, updateOnePartial } from '#lib/server/queries.ts';
import { sign } from '#lib/server/server_auth.ts';

// DISPATCH ====================================================================================================

// How long a failed push gets retried, ntfy may just be restarting | after that the reminder moves on
const RETRY_WINDOW = 60 * 60 * 1000

// One run at a time, a slow one overlapping the next minute would push the same reminders twice
let running = false

// Sends every reminder that is due and moves it on to its next time | runs every minute from the pocketbase cron
export async function dispatchDueReminders(now = new Date()) {
    if(running) return { sent: 0, failed: ['The previous run is still going.'] }
    running = true
    try { return await dispatch(now) }
    finally { running = false }
}

async function dispatch(now: Date) {
    const due = await getDueReminders(now)
    if(!due.success) return { sent: 0, failed: [due.error] }

    let sent = 0
    const failed: string[] = []

    for(const reminder of due.data){
        const note = reminder.expand?.note as Note | undefined
        const owner = reminder.expand?.owner as User | undefined

        // PUBLISH | skipped without a topic, the reminder still moves on so it does not pile up
        if(note && owner?.ntfyTopic){
            const result = await publish(notification(reminder, note, owner.ntfyTopic))
            if(result.success) sent++
            else failed.push(`${reminder.id}: ${result.error}`)

            // RETRY | stays due, so the next run tries again
            if(!result.success && now.getTime() - (parseTimestamp(reminder.next)?.getTime() ?? 0) < RETRY_WINDOW) continue
        }

        // MOVE ON | missed times while the server was down collapse into this one notification
        const next = occurrenceAfter(reminder, now)
        const moved = await updateOnePartial('reminders', reminder.id, { sent: reminder.next, next: next?.toISOString() ?? '' })
        if(!moved.success) failed.push(`${reminder.id}: ${moved.error}`)
    }

    return { sent, failed }
}



// NOTIFICATION ====================================================================================================
export function notification(reminder: Reminder, note: Note, topic: string): NtfyMessage {
    const message: NtfyMessage = {
        topic,
        title: note.title || 'Reminder',
        message: preview(note) || 'Time for this note.',
        tags: [reminder.task ? 'ballot_box_with_check' : 'bell'],
    }
    if(!ORIGIN) return message // links need the public address
    const origin = ORIGIN.replace(/\/+$/, '')

    message.click = `${origin}/?note=${note.id}`

    // DONE BUTTON | signed for this one occurrence, so an old notification cannot tick off a later one
    if(reminder.task){
        message.actions = [{
            action: 'http',
            label: 'Done',
            url: `${origin}/api/reminders/${reminder.id}/done`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ occurrence: reminder.next, signature: sign(doneSubject(reminder.id, reminder.next)) }),
            clear: true,
        }]
    }

    return message
}

export function doneSubject(id: string, occurrence: string){
    return `reminder-done:${id}:${occurrence}`
}

// First lines as plain text, ntfy cuts long messages anyway
function preview(note: Note): string {
    return markdownToText(note.body).slice(0, 500)
}
