import { ORIGIN, VAPID_PRIVATE_KEY } from '$app/env/private';
import { PUBLIC_VAPID_KEY } from '$app/env/public';
import type { Push } from '#lib/server/push.ts';
import { deleteOne, getAllOwned } from '#lib/server/queries.ts';
import { failure, OK, type Result } from '#lib/server/result.ts';
import webpush from 'web-push';

// A reminder hours late still helps, a day late only clutters
const TTL = 12 * 60 * 60

// Push services want an address to reach the sender, and refuse anything but https or mail
const subject = ORIGIN?.startsWith('https:') ? ORIGIN : 'mailto:reminders@notifica.invalid'

// Every browser of the user, or just the one with this endpoint
export async function sendWebPush(user: string, push: Push, only?: string): Promise<Result<true>[]> {
    if(!PUBLIC_VAPID_KEY || !VAPID_PRIVATE_KEY) return []

    const subscriptions = await getAllOwned('push_subscriptions', user)
    if(!subscriptions.success) return [subscriptions]

    const targets = only ? subscriptions.data.filter(({ endpoint }) => endpoint === only) : subscriptions.data
    return await Promise.all(targets.map(async ({ id, endpoint, p256dh, auth }) => {
        try {
            await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify(push), {
                TTL,
                urgency: 'high',
                timeout: 10_000,
                vapidDetails: { subject, publicKey: PUBLIC_VAPID_KEY as string, privateKey: VAPID_PRIVATE_KEY as string },
            })
            return OK
        } catch (err) {

            // The browser dropped this subscription for good, nothing to retry
            const status = (err as { statusCode?: number }).statusCode
            if(status === 404 || status === 410){
                await deleteOne('push_subscriptions', id)
                return OK
            }

            return failure(`web push failed: ${err instanceof Error ? err.message : String(err)}`)
        }
    }))
}
