import { notify } from '#lib/notifications.svelte.ts';
import { track } from '#lib/singletons/busy.svelte.ts';
import { checkServer } from '#lib/singletons/server_status.svelte.ts';

// Runs a call from the browser, a failure becomes a toast and null
export async function safeAction<T>(promise: Promise<T>): Promise<T | null> {
    try {
        const result = await track(promise); // Slow ones show the progress bar
        return result;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {

        // SERVER GONE | the banner says so, a toast per failed call would only pile up
        if((err?.status === undefined || err.status >= 500) && !(await checkServer())) return null;

        const message = err?.body?.message ?? err?.message ?? 'An unexpected error occurred.';
        notify(err?.body?.details ? `${message}
(${err.body.details})` : message, { type: 'error' });
        return null;
    }
}
