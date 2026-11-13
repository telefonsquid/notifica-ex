import type { TestChannel } from '#lib/reminders.ts';
import type { User } from '#lib/schemas/users.ts';
import { broadcast } from '#lib/server/app_stream.ts';
import { sendNtfy } from '#lib/server/ntfy.ts';
import type { Push } from '#lib/server/push.ts';
import { OK, type Result } from '#lib/server/result.ts';
import { sendWebPush } from '#lib/server/web_push.ts';

// One result per place it tried, empty when the user has no way to get it
export async function deliver(user: User, push: Push): Promise<Result<true>[]> {
    const results = await Promise.all([toPhones(user, push), toNtfy(user, push), sendWebPush(user.id, push)])
    return results.flat()
}

// The test button of one settings row | a browser only tests itself, others may belong to someone at work
export async function deliverTest(user: User, channel: TestChannel, endpoint?: string): Promise<Result<true>[]> {
    const push: Push = { id: crypto.randomUUID(), title: 'Test', message: '', task: false, cursor: '' }

    if(channel === 'phone') return toPhones(user, push)
    if(channel === 'ntfy') return await toNtfy(user, push)
    return endpoint ? await sendWebPush(user.id, push, endpoint) : []
}

function toPhones(user: User, push: Push): Result<true>[] {
    if(user.appPaused) return []
    return Array.from({ length: broadcast(user.id, push) }, () => OK)
}

async function toNtfy(user: User, push: Push): Promise<Result<true>[]> {
    if(!user.ntfyTopic || user.ntfyPaused) return []
    return await sendNtfy(user.ntfyTopic, push)
}
