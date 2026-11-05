import { describeRule, occurrenceAfter, parseTimestamp } from '#lib/reminders.ts';
import type { Note, User } from '#lib/schemas.ts';
import { deliver, pushFor } from '#lib/server/delivery.ts';
import { countOpenOccurrences, deleteOne, getDueReminders, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';

// DISPATCH ====================================================================================================

// How long a push that reached nowhere gets retried, ntfy may just be restarting | after that the reminder moves on
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

        // GONE | its owner was taken off the shared note, nothing to push about any more
        if(note && note.owner !== reminder.owner && !note.shared.includes(reminder.owner)){
            const removed = await deleteOne('reminders', reminder.id)
            if(!removed.success) failed.push(`${reminder.id}: ${removed.error}`)
            continue
        }

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

        // DELIVER | no way to reach the owner still moves on, so it does not pile up
        if(note && owner){
            const results = await deliver(owner, pushFor(note, reminder.task, logged.data))
            const errors = results.filter((result) => !result.success)
            if(results.length > errors.length) sent++
            failed.push(...errors.map((result) => `${reminder.id}: ${result.error}`))

            // RETRY | only when it reached nowhere, stays due for the next run and its log entry goes so the history holds it once
            if(results.length && errors.length === results.length && at.getTime() - (parseTimestamp(reminder.next)?.getTime() ?? 0) < RETRY_WINDOW){
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
