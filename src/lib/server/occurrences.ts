import { describeRule } from '#lib/reminders.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import type { Occurrence, Reminder } from '#lib/schemas/reminders.ts';
import { deleteOne, findOne, insertOnePartial, run } from '#lib/server/queries.ts';
import type PocketBase from 'pocketbase';
import type { ListResult } from 'pocketbase';

// The log of every time a reminder went off | the open count on a reminder follows it, so changes to the log go through here

// Times still waiting for their Done button
const OPEN = 'task = true && done = ""'

// READING ====================================================================================================

// What a device missed while it had no connection, newest first
export async function getOccurrencesSince(owner: string, after: string, limit: number) {
    return run((pb) => {
        const filter = pb.filter('owner = {:owner} && created > {:after} && done = ""', { owner, after })   // What got checked off meanwhile stays quiet
        return pb.collection('occurrences').getList(1, limit, { filter, sort: '-created', expand: 'note', skipTotal: true }) as Promise<ListResult<Occurrence>>
    })
}

// Newest first, one page at a time since a minute reminder logs a lot
export async function getOccurrences(note: string, owner: string, perPage: number) {
    return run((pb) => {
        const filter = pb.filter('note = {:note} && owner = {:owner}', { note, owner })
        return pb.collection('occurrences').getList(1, perPage, { filter, sort: '-at,-created' }) as Promise<ListResult<Occurrence>>
    })
}

// Times on a note still waiting for their Done button, oldest first
export async function getOpenOccurrences(note: string, owner: string) {
    return run((pb) => {
        const filter = pb.filter(`note = {:note} && owner = {:owner} && ${OPEN}`, { note, owner })
        return pb.collection('occurrences').getFullList({ filter, sort: 'at', fields: 'id,reminder,done' }) as Promise<Checkable[]>
    })
}

export async function getNewestOpenOccurrence(reminder: string) {
    return findOne('occurrences', `reminder = {:reminder} && ${OPEN}`, { sort: '-at' }, { reminder })
}



// LOGGING ====================================================================================================

// Whatever happens to the reminder later, its history keeps this time
export async function logOccurrence(reminder: Reminder) {
    return insertOnePartial('occurrences', {
        owner: reminder.owner,
        note: reminder.note,
        reminder: reminder.id,
        at: reminder.next,
        rule: describeRule(reminder).slice(0, LIMITS.OCCURRENCE_RULE),
        timezone: reminder.timezone,
        task: reminder.task,
    })
}

// A push that reached nowhere gets retried, the history must hold it once
export async function forgetOccurrence(id: string) {
    return deleteOne('occurrences', id)
}



// CHECKING OFF ===============================================================================================
type Checkable = Pick<Occurrence, 'id' | 'reminder' | 'done'>

// Those already in that state stay as they are, so a second press keeps the first time
export async function setDone(occurrences: Checkable[], done: boolean, comment?: string) {
    const changing = occurrences.filter((occurrence) => !!occurrence.done !== done)
    const changes = { done: done ? new Date().toISOString() : '', ...(comment ? { comment } : {}) }

    return run(async (pb) => {
        const updated: Occurrence[] = []
        for(const { id } of changing) updated.push(await pb.collection('occurrences').update(id, changes))

        // Recount each reminder once
        for(const reminder of new Set(changing.map((occurrence) => occurrence.reminder).filter(Boolean))) await recount(pb, reminder)
        return updated
    })
}

export async function countOpenOccurrences(reminder: string) {
    return run((pb) => recount(pb, reminder))
}

// Keeps the count on the reminder in step with its log, the card badge and filters read it from there
async function recount(pb: PocketBase, reminder: string) {
    const filter = pb.filter(`reminder = {:reminder} && ${OPEN}`, { reminder })
    const page = await pb.collection('occurrences').getList(1, 1, { filter, fields: 'id' })
    return await pb.collection('reminders').update(reminder, { open: page.totalItems }) as Reminder
}
