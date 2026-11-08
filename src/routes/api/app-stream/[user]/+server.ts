import { pbTime } from '#lib/reminders.ts';
import { isId } from '#lib/schemas/base.ts';
import { streamFor, streamSubject } from '#lib/server/app_stream.ts';
import { getOccurrencesSince } from '#lib/server/occurrences.ts';
import { pushFor } from '#lib/server/push.ts';
import { getOne } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { hasValidSignature } from '#lib/server/server_auth.ts';
import type { Note } from '#lib/schemas/notes.ts';
import type { User } from '#lib/schemas/users.ts';
import { error } from '@sveltejs/kit';
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
    if(!isId(params.user)) error(401, 'Unknown stream.')

    // Only a missing user reads as a bad key, the app gives up on those and retries anything else
    const user = orNull(await getOne('users', params.user), 'Stream not available.')
    if(!user || user.state === 'inactive' || !hasValidSignature(streamSubject(user), url.searchParams.get('key') ?? '')) error(401, 'Unknown stream.')

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
