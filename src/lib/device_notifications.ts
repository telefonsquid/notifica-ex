import { PUBLIC_VAPID_KEY } from '$app/env/public';
import { addPushSubscription, getAppStream, removePushSubscription } from '../routes/api/reminders.remote';

// Which account and subscription the server already knows of, so an ordinary page load asks it nothing
const REGISTERED = 'notifica-push-registered';

// BROWSER ====================================================================================================
export function browserPushBlocker(): string | null {
    if(!window.isSecureContext) return 'Needs https';
    if(!PUBLIC_VAPID_KEY) return 'Not set up';
    if(!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return 'Not available';
    if(Notification.permission === 'denied') return 'Blocked';
    return null;
}

async function currentSubscription() {
    const registration = await navigator.serviceWorker.getRegistration();
    return await registration?.pushManager.getSubscription() ?? null;
}

export async function browserPushOn() {
    return Notification.permission === 'granted' && !!(await currentSubscription());
}

async function register(subscription: PushSubscription, user: string) {
    const { endpoint, keys } = subscription.toJSON();
    await addPushSubscription({ endpoint: endpoint as string, p256dh: keys?.p256dh as string, auth: keys?.auth as string });
    localStorage.setItem(REGISTERED, `${user} ${endpoint}`);
}

// False when the browser or its user said no
export async function enableBrowserPush(user: string) {
    if(await Notification.requestPermission() !== 'granted') return false;

    const registration = await navigator.serviceWorker.register('/push-worker.js');
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: PUBLIC_VAPID_KEY });
    await register(subscription, user);
    return true;
}

export async function disableBrowserPush() {
    const subscription = await currentSubscription();
    if(!subscription) return;

    await removePushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
    localStorage.removeItem(REGISTERED);
}

// APP ====================================================================================================
export function androidApp() {
    return window.NotificaAndroid?.listen ? window.NotificaAndroid : null;
}

// EVERY START ================================================================================================
// The app connects itself once it knows the address | browsers can renew a subscription on their own
export async function startDeviceNotifications(user: string) {
    const app = androidApp();
    if(app){
        app.listen?.(new URL(await getAppStream(), location.origin).href);
        return;
    }

    if(browserPushBlocker() || !(await browserPushOn())) return;
    const subscription = await currentSubscription();
    if(subscription && localStorage.getItem(REGISTERED) !== `${user} ${subscription.endpoint}`) await register(subscription, user);
}

// This device must not get the next account's reminders, nor the last one's after logging out
export async function stopDeviceNotifications() {
    androidApp()?.stopListening?.();
    if(!browserPushBlocker()) await disableBrowserPush();
}
