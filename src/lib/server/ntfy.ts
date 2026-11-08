import * as env from '$app/env/private';
import type { SnoozeChoice } from '#lib/reminders.ts';
import type { Push } from '#lib/server/push.ts';
import { failure, OK, type Result } from '#lib/server/result.ts';

// Subset of the ntfy publish api this app uses, see https://docs.ntfy.sh/publish/#publish-as-json
type NtfyMessage = {
    topic: string
    title?: string
    message: string
    tags?: string[]
    click?: string                  // Opened when the notification is tapped
    actions?: NtfyHttpAction[]
}

type NtfyHttpAction = {
    action: 'http'
    label: string
    url: string                     // Called straight from the phone, so it must be the public address
    method?: 'POST'
    headers?: Record<string, string>
    body?: string
    clear?: boolean                 // Dismiss the notification once the call went through
}

// One result per place it tried, empty on a server without ntfy
export async function sendNtfy(topic: string, push: Push): Promise<Result<true>[]> {
    if(!env.NTFY_URL) return []
    return [await publish(env.NTFY_URL, ntfyMessage(topic, push))]
}

// Result instead of throwing, one failed topic must not stop the others
async function publish(url: string, message: NtfyMessage): Promise<Result<true>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if(env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`

    try {
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) })
        if(response.ok) return OK
        return failure(`ntfy answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
    } catch (err) {
        return failure(`ntfy unreachable: ${err instanceof Error ? err.message : String(err)}`)
    }
}

function ntfyMessage(topic: string, push: Push): NtfyMessage {
    const message: NtfyMessage = {
        topic,
        title: push.title,
        message: push.message,
        tags: [push.task ? 'ballot_box_with_check' : 'bell'],
    }
    if(!env.ORIGIN) return message // Links need the public address
    const origin = env.ORIGIN.replace(/\/+$/, '')

    if(push.click) message.click = origin + push.click

    const action = (label: string, path: string, body: object) => ({
        action: 'http' as const,
        label,
        url: origin + path,
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        clear: true,
    })
    const { done, snooze } = push
    message.actions = [
        ...(done ? [action('Done', done.path, { signature: done.signature })] : []),
        ...(snooze ? [
            action('1 hour', snooze.path, { signature: snooze.signature, until: 'hour' satisfies SnoozeChoice }),
            action('Tomorrow', snooze.path, { signature: snooze.signature, until: 'tomorrow' satisfies SnoozeChoice }),
        ] : []),
    ]
    return message
}
