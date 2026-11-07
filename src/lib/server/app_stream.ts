import type { Push } from '#lib/server/delivery.ts';
import type { User } from '#lib/schemas.ts';

// Who listens right now, the Android app keeps one connection per phone | lives in this process, the app runs as a single one
const listeners = new Map<string, Set<Listener>>()

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

// Stays valid until the account is deactivated or its password changes
export function streamSubject(user: Pick<User, 'id' | 'streamEpoch'>) {
    return `app-stream:${user.id}:${user.streamEpoch ?? 0}`
}
