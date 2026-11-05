import { isId } from '#lib/schema_limits.ts';
import { listen, streamSubject } from '#lib/server/app_stream.ts';
import { pushFor, type Push } from '#lib/server/delivery.ts';
import { getPbAdminConnection } from '#lib/server/pocketbase_admin_connection.ts';
import { getOccurrencesSince } from '#lib/server/queries.ts';
import { hasValidSignature } from '#lib/server/server_auth.ts';
import type { Note, User } from '#lib/schemas.ts';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Older ones have gone stale when a phone comes back
const CATCH_UP_WINDOW = 12 * 60 * 60 * 1000
const CATCH_UP_MAX = 20

// Below what phones and proxies tolerate as silence, a dead connection shows on the app's read timeout
const HEARTBEAT = 55_000

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

// One line of json per notification, held open for as long as the Android app stays connected
export const GET: RequestHandler = async ({ params, url }) => {
    if(!isId(params.user)) error(401, 'Unknown stream.')

    const user = await loadUser(params.user)
    if(user.state === 'inactive' || !hasValidSignature(streamSubject(user.id), url.searchParams.get('key') ?? '')) error(401, 'Unknown stream.')

    const since = url.searchParams.get('since') ?? ''
    const encoder = new TextEncoder()
    let stop = () => {}

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (line: Push | { cursor: string }) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
            const heartbeat = setInterval(() => controller.enqueue(encoder.encode('\n')), HEARTBEAT)

            // Live pushes first, so none falls between the catch up and listening | the app drops doubles
            const leave = listen(user.id, send)
            stop = () => {
                clearInterval(heartbeat)
                leave()
            }

            // A first connection starts now, instead of with everything from before the install
            send({ cursor: since || pbTime(new Date()) })
            if(!since) return

            const oldest = pbTime(new Date(Date.now() - CATCH_UP_WINDOW))
            const missed = await getOccurrencesSince(user.id, since > oldest ? since : oldest, CATCH_UP_MAX)
            if(!missed.success) return

            for(const occurrence of missed.data.items.toReversed()){
                const note = occurrence.expand?.note as Note | undefined
                if(note) send(pushFor(note, occurrence.task, occurrence))
            }
        },
        cancel() {
            stop()
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
        },
    })
}
