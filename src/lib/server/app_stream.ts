import type { Push } from '#lib/server/delivery.ts';

// Who listens right now, the Android app keeps one connection per phone | lives in this process, the app runs as a single one
const listeners = new Map<string, Set<(push: Push) => void>>()

export function listen(user: string, send: (push: Push) => void) {
    const own = listeners.get(user) ?? new Set()
    listeners.set(user, own)
    own.add(send)

    return () => {
        own.delete(send)
        if(!own.size) listeners.delete(user)
    }
}

// How many phones got it | one that is away now catches up from the history once it reconnects
export function broadcast(user: string, push: Push) {
    const own = listeners.get(user)
    if(!own) return 0
    let reached = 0
    for(const send of own){
        try {
            send(push)
            reached++
        } catch {
            own.delete(send) // Closed in the same moment, one dead phone must not stop the rest
        }
    }
    return reached
}

// Stays valid until the account is deactivated
export function streamSubject(user: string) {
    return `app-stream:${user}`
}
