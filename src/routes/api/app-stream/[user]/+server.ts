import { isId } from '#lib/schemas.ts';
import { streamFor, streamSubject } from '#lib/server/app_stream.ts';
import { pushFor } from '#lib/server/delivery.ts';
import { getPbAdminConnection } from '#lib/server/pocketbase_admin_connection.ts';
import { getOccurrencesSince } from '#lib/server/queries.ts';
import { hasValidSignature } from '#lib/server/server_auth.ts';
import type { Note, User } from '#lib/schemas.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Older ones have gone stale when a phone comes back
const CATCH_UP_WINDOW = 12 * 60 * 60 * 1000
const CATCH_UP_MAX = 20

function pbTime(date: Date){
    return date.toISOString().replace('T', ' ')
}

// A database that is away must not read as a bad key, the app gives up on those
async function loadUser(id: string): Promise<User> {
    let found: User
    try {
        const pb = await getPbAdminConnection()
        found = await pb.collection('users').getOne<User>(id)
    } catch (err) {
        error((err as { status?: number }).status === 404 ? 401 : 503, 'Stream not available.')
    }
    return found
}

// What a phone missed while it was away, oldest first
async function missedSince(user: string, since: string) {
    const oldest = pbTime(new Date(Date.now() - CATCH_UP_WINDOW))
    const missed = await getOccurrencesSince(user, since > oldest ? since : oldest, CATCH_UP_MAX)
    if(!missed.success) return []

    return missed.data.items.toReversed().flatMap((occurrence) => {
        const note = occurrence.expand?.note as Note | undefined
        return note ? [pushFor(note, occurrence.task, occurrence)] : []
    })
}

export const GET: RequestHandler = async ({ params, url }) => {
    if(!isId(params.user)) error(401, 'Unknown stream.')

    const user = await loadUser(params.user)
    if(user.state === 'inactive' || !hasValidSignature(streamSubject(user), url.searchParams.get('key') ?? '')) error(401, 'Unknown stream.')

    // A first connection starts now, instead of with everything from before the install
    const since = url.searchParams.get('since') ?? ''
    const stream = streamFor(user.id, since || pbTime(new Date()), async () => since ? missedSince(user.id, since) : [])

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
        },
    })
}
