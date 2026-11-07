import type { Push } from '#lib/server/delivery.ts';
import type { User } from '#lib/schemas.ts';

// Who listens right now, the Android app keeps one connection per phone | lives in this process, the app runs as a single one
const listeners = new Map<string, Set<Listener>>()

// Below what phones and proxies tolerate as silence, a dead connection shows on the app's read timeout
const HEARTBEAT = 55_000

type Listener = { send: (push: Push) => void, end: () => void }

export function listen(user: string, listener: Listener) {
    const own = listeners.get(user) ?? new Set()
    listeners.set(user, own)
    own.add(listener)

    return () => {
        own.delete(listener)
        if(!own.size) listeners.delete(user)
    }
}

// Hangs up on every phone of the user | a phone with an old key then hears 401 when it tries again
export function endStreams(user: string) {
    for(const listener of listeners.get(user) ?? []) listener.end()
}

// How many phones got it | one that is away now catches up from the history once it reconnects
export function broadcast(user: string, push: Push) {
    const own = listeners.get(user)
    if(!own) return 0
    let reached = 0
    for(const listener of own){
        try {
            listener.send(push)
            reached++
        } catch {
            own.delete(listener) // Closed in the same moment, one dead phone must not stop the rest
        }
    }
    return reached
}

// One line of json per notification, held open for as long as the phone stays connected | nothing in here may throw, a timer that throws ends the whole server
export function streamFor(user: string, cursor: string, catchUp: () => Promise<Push[]>, heartbeat = HEARTBEAT) {
    const encoder = new TextEncoder()
    let stop = () => {}

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (line: Push | { cursor: string }) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
            const finish = () => {
                stop()
                try { controller.close() } catch { /* Closed by the other side in the same moment */ }
            }

            const timer = setInterval(() => {
                try { controller.enqueue(encoder.encode('\n')) } catch { stop() }
            }, heartbeat)

            // Live pushes first, so none falls between the catch up and listening | the app drops doubles
            const leave = listen(user, { send, end: finish })
            stop = () => {
                clearInterval(timer)
                leave()
            }

            // A database gone mid request or a hang up during the catch up ends the stream, the phone tries again
            try {
                send({ cursor })
                for(const push of await catchUp()) send(push)
            } catch {
                finish()
            }
        },
        cancel() {
            stop()
        },
    })
}

// Stays valid until the account is deactivated or its password changes
export function streamSubject(user: Pick<User, 'id' | 'streamEpoch'>) {
    return `app-stream:${user.id}:${user.streamEpoch ?? 0}`
}
