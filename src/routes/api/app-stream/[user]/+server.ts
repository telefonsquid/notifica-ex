import { pbTime } from '#lib/reminders.ts';
import { streamFor } from '#lib/server/app_stream.ts';
import { keyHolder } from '#lib/server/stream_key.ts';
import { getOccurrencesSince } from '#lib/server/occurrences.ts';
import { pushFor } from '#lib/server/push.ts';
import { unwrap } from '#lib/server/result.ts';
import type { Note } from '#lib/schemas/notes.ts';
import type { User } from '#lib/schemas/users.ts';
import type { RequestHandler } from './$types';

// Older ones have gone stale when a phone comes back
const CATCH_UP_WINDOW = 12 * 60 * 60 * 1000
const CATCH_UP_MAX = 20

// What a phone missed while it was away, oldest first | a time the account had the app paused stays silent
async function missedSince(user: User, since: string) {
    if(user.appPaused) return []

    const oldest = pbTime(new Date(Date.now() - CATCH_UP_WINDOW))
    const start = [since, oldest, user.appResumed ?? ''].reduce((latest, time) => time > latest ? time : latest)
    const missed = unwrap(await getOccurrencesSince(user.id, start, CATCH_UP_MAX), 'Could not catch up.')

    return missed.items.toReversed().flatMap((occurrence) => {
        const note = occurrence.expand?.note as Note | undefined
        return note ? [pushFor(note, occurrence.task, occurrence)] : []
    })
}

export const GET: RequestHandler = async ({ params, url }) => {
    const user = await keyHolder(params.user, url.searchParams.get('key') ?? '')

    // A first connection starts now, instead of with everything from before the install
    const since = url.searchParams.get('since') ?? ''
    const stream = streamFor(user.id, since || pbTime(new Date()), async () => since ? missedSince(user, since) : [])

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
        },
    })
}
