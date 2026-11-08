import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { stopDeviceNotifications } from '#lib/device_notifications.ts';
import { saveOpenNotes } from '#lib/drafts.ts';
import { forgetKey } from '#lib/note_lock.svelte.ts';
import { finishRemovals } from '#lib/note_removal.ts';
import { disconnectRealtime } from '#lib/realtime.ts';
import { safeAction } from '#lib/safe_action.ts';
import { logoutUser } from '../routes/api/auth.remote';

// The next account on this device must not get these events or reminders | unsubscribing needs the session, so it goes first
export async function logout(){
    await safeAction(stopDeviceNotifications())
    await saveOpenNotes()
    await finishRemovals()

    const done = await safeAction(logoutUser())
    if(!done) return

    disconnectRealtime()
    forgetKey()
    await goto(resolve('/login'), { refreshAll: true })
}
