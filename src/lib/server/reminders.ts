import { ORIGIN } from '$app/env/private';
import { markdownToText } from '#lib/markdown.ts';
import { describeRule, occurrenceAfter, parseTimestamp } from '#lib/reminders.ts';
import type { Note, Occurrence, Reminder, User } from '#lib/schemas.ts';
import { publish, type NtfyMessage } from '#lib/server/ntfy.ts';
import { countOpenOccurrences, deleteOne, getDueReminders, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { sign } from '#lib/server/server_auth.ts';

// DISPATCH ====================================================================================================

// How long a failed push gets retried, ntfy may just be restarting | after that the reminder moves on
const RETRY_WINDOW = 60 * 60 * 1000

// One run at a time, a slow one overlapping the next minute would push the same reminders twice
let running = false

// Sends every reminder that is due and moves it on to its next time | runs every minute from the pocketbase cron
export async function dispatchDueReminders(at = new Date()) {
    if(running) return { sent: 0, failed: ['The previous run is still going.'] }
    running = true
    try { return await dispatch(at) }
    finally { running = false }
}

async function dispatch(at: Date) {

    // The cron sometimes fires a few ms before the full minute, so whatever falls due before the next run counts as due now
    const now = new Date(at.getTime() + 30_000)

    const due = await getDueReminders(now)
    if(!due.success) return { sent: 0, failed: [due.error] }

    let sent = 0
    const failed: string[] = []

    for(const reminder of due.data){
        const note = reminder.expand?.note as Note | undefined
        const owner = reminder.expand?.owner as User | undefined

        // LOG | the history keeps every time it went off, whatever happens to the reminder later
        const logged = await insertOnePartial('occurrences', {
            owner: reminder.owner,
            note: reminder.note,
            reminder: reminder.id,
            at: reminder.next,
            rule: describeRule(reminder),
            timezone: reminder.timezone,
            task: reminder.task,
        })
        if(!logged.success) failed.push(`${reminder.id}: ${logged.error}`)

        // PUBLISH | skipped without a topic, the reminder still moves on so it does not pile up
        if(note && owner?.ntfyTopic){
            const result = await publish(notification(reminder, note, owner.ntfyTopic, logged.data))
            if(result.success) sent++
            else failed.push(`${reminder.id}: ${result.error}`)

            // RETRY | stays due for the next run, its log entry goes so the history holds it once
            if(!result.success && at.getTime() - (parseTimestamp(reminder.next)?.getTime() ?? 0) < RETRY_WINDOW){
                if(logged.success) await deleteOne('occurrences', logged.data.id)
                continue
            }
        }

        // MOVE ON | missed times while the server was down collapse into this one notification
        const next = occurrenceAfter(reminder, now)
        const moved = await updateOnePartial('reminders', reminder.id, { next: next?.toISOString() ?? '' })
        if(!moved.success) failed.push(`${reminder.id}: ${moved.error}`)
        if(reminder.task) await countOpenOccurrences(reminder.id)
    }

    return { sent, failed }
}



// NOTIFICATION ====================================================================================================
export function notification(reminder: Reminder, note: Note, topic: string, occurrence: Occurrence | null): NtfyMessage {
    const message: NtfyMessage = {
        topic,
        title: note.title || 'Reminder',
        message: preview(note) || 'Time for this note.',
        tags: [reminder.task ? 'ballot_box_with_check' : 'bell'],
    }
    if(!ORIGIN) return message // links need the public address

    message.click = `${ORIGIN}/?note=${note.id}`

    // DONE BUTTON | signed for this one occurrence, so it ticks off just that one however late it gets pressed
    if(reminder.task && occurrence){
        message.actions = [{
            action: 'http',
            label: 'Done',
            url: `${ORIGIN}/api/occurrences/${occurrence.id}/done`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signature: sign(doneSubject(occurrence.id)) }),
            clear: true,
        }]
    }

    return message
}

export function doneSubject(occurrence: string){
    return `occurrence-done:${occurrence}`
}

// First lines as plain text, ntfy cuts long messages anyway
function preview(note: Note): string {
    return markdownToText(note.body).slice(0, 500)
}
