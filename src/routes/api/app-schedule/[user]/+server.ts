import { upcomingTimes } from '#lib/reminders.ts';
import type { Note } from '#lib/schemas/notes.ts';
import type { Reminder } from '#lib/schemas/reminders.ts';
import { canSee } from '#lib/server/note_access.ts';
import { scheduledPushFor } from '#lib/server/push.ts';
import { run } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { keyHolder } from '#lib/server/stream_key.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The phone syncs far more often than this, the rest stays out so a minute reminder can't flood it
const AHEAD = 48 * 60 * 60 * 1000
const PER_REMINDER = 20
const TOTAL = 200

async function getPendingReminders(owner: string) {
    return run((pb) => {
        const filter = pb.filter('owner = {:owner} && next != ""', { owner })
        return pb.collection('reminders').getFullList<Reminder>({ filter, expand: 'note' })
    })
}

// What the Android app sets alarms for, soonest first | a paused account gets nothing, the phone then clears its alarms
export const GET: RequestHandler = async ({ params, url }) => {
    const user = await keyHolder(params.user, url.searchParams.get('key') ?? '')
    const now = new Date()
    const until = new Date(now.getTime() + AHEAD)
    if(user.appPaused) return json({ entries: [], until: until.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })

    const reminders = unwrap(await getPendingReminders(user.id), 'Could not load reminders.')
    const entries = reminders
        .flatMap((reminder) => {
            const note = reminder.expand?.note as Note | undefined
            if(!note || !canSee(note, user.id)) return []
            return upcomingTimes(reminder, now, until, PER_REMINDER).map((at) => scheduledPushFor(note, reminder.task, reminder.id, at))
        })
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, TOTAL)

    return json({ entries, until: until.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}
