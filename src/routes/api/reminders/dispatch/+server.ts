import { dispatchDueReminders } from '#lib/server/reminders.ts';
import { restrictToServer } from '#lib/server/server_auth.ts';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {

    // RESTRICT TO THE POCKETBASE CRON HOOK
    restrictToServer(request)

    // SEND WHAT IS DUE
    const result = await dispatchDueReminders()
    if(result.failed.length) console.error('Reminder dispatch failed for', result.failed)
    return json(result, { status: result.failed.length ? 207 : 200 });

}
