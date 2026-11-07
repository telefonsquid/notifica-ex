import { describeRule, isDue, movedOn, parseTimestamp } from '#lib/reminders.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import type { Note, User } from '#lib/schemas.ts';
import { deliver, pushFor } from '#lib/server/delivery.ts';
import { countOpenOccurrences, deleteOne, getDueReminders, getReminderNow, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';

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

    for(const { id } of due.data){

        // FRESH | the run may have waited minutes on slow pushes, this one may be deleted or moved by now
        const read = await getReminderNow(id)
        if(!read.success){
            failed.push(`${id}: ${read.error}`)
            continue
        }
        const reminder = read.data
        if(!reminder || !isDue(reminder, now)) continue

        const note = reminder.expand?.note as Note | undefined
        const owner = reminder.expand?.owner as User | undefined
        const late = at.getTime() - (parseTimestamp(reminder.next)?.getTime() ?? 0)

        // GONE | its owner was taken off the shared note, nothing to push about any more
        if(note && note.owner !== reminder.owner && !note.shared.includes(reminder.owner)){
            const removed = await deleteOne('reminders', reminder.id)
            if(!removed.success) failed.push(`${reminder.id}: ${removed.error}`)
            continue
        }

        // An inactive owner hears nothing and their history stays as it was
        if(owner?.state !== 'inactive'){

            // LOG | the history keeps every time it went off, whatever happens to the reminder later
            const logged = await insertOnePartial('occurrences', {
                owner: reminder.owner,
                note: reminder.note,
                reminder: id,
                at: reminder.next,
                rule: describeRule(reminder).slice(0, LIMITS.OCCURRENCE_RULE),
                timezone: reminder.timezone,
                task: reminder.task,
            })

            // A push without a log entry has no buttons and the history misses it | only an hour late is that better than silence
            if(!logged.success){
                failed.push(`${id}: ${logged.error}`)
                if(late < RETRY_WINDOW) continue
            }

            // DELIVER | no way to reach the owner still moves on, so it does not pile up
            if(note && owner){
                const results = await deliver(owner, pushFor(note, reminder.task, logged.data))
                const errors = results.filter((result) => !result.success)
                if(results.length > errors.length) sent++
                failed.push(...errors.map((result) => `${id}: ${result.error}`))

                // RETRY | only when it reached nowhere, stays due for the next run and its log entry goes so the history holds it once
                if(results.length && errors.length === results.length && late < RETRY_WINDOW){
                    if(logged.success) await deleteOne('occurrences', logged.data.id)
                    continue
                }
            }
        }

        // MOVE ON | missed times while the server was down collapse into this one notification
        const latest = await getReminderNow(id)
        if(!latest.success){
            failed.push(`${id}: ${latest.error}`)
            continue
        }
        const next = movedOn(reminder, latest.data, now)
        if(next !== null){
            const moved = await updateOnePartial('reminders', id, { next })
            if(!moved.success) failed.push(`${id}: ${moved.error}`)
        }
        if(latest.data && reminder.task) await countOpenOccurrences(id)
    }

    return { sent, failed }
}
