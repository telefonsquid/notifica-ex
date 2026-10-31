import { invalidateAll } from '$app/navigation';
import { pb } from '#lib/pocketbase.ts';
import type { Collection } from '#lib/schemas.ts';
import type { RecordModel, RecordSubscription } from 'pocketbase';

/*
    Live updates straight from PocketBase, so no page ever needs a reload.
    The browser subscribes with the token of the server session, so PocketBase filters
    every event through the same list and view rules as a normal request.
*/



// CONNECTION ====================================================================================================
let connectedOnce = false

// CONNECT | call with the token from the root layout data, returns the disconnect
export function connectRealtime(token: string): () => void {
    pb.authStore.save(token, null)

    // RELOAD DATA AFTER A RECONNECT | events sent while offline are lost
    const resync = pb.realtime.subscribe('PB_CONNECT', () => {
        if(connectedOnce) invalidateAll()
        connectedOnce = true
    })

    return () => {
        resync.then((unsubscribe) => unsubscribe()).catch(() => {})
        disconnectRealtime()
    }
}

// DISCONNECT | also on logout, so the next user on this device starts clean
export function disconnectRealtime(){
    pb.realtime.unsubscribe().catch(() => {})
    pb.authStore.clear()
    connectedOnce = false
}



// SUBSCRIPTIONS ====================================================================================================
// ON RECORD CHANGE | topic is a record id or '*' for the whole collection, returns the unsubscribe for $effect cleanups
export function onRecordChange<T extends RecordModel = RecordModel>(
    collection: Collection,
    callback: (event: RecordSubscription<T>) => void,
    topic: string = '*'
): () => void {
    let unsubscribe: (() => Promise<void>) | undefined
    let cancelled = false

    // Subscribing is async, the cleanup may run before it finished
    pb.collection(collection).subscribe<T>(topic, callback)
        .then((fn) => {
            if(cancelled) fn().catch(() => {})
            else unsubscribe = fn
        })
        .catch((err) => console.error(`Realtime subscription to ${collection}/${topic} failed`, err))

    return () => {
        cancelled = true
        unsubscribe?.().catch(() => {})
    }
}
