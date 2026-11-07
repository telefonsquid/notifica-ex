import { NTFY_URL, ORIGIN } from '$app/env/private';
import { markdownToText } from '#lib/markdown.ts';
import type { Note, Occurrence, User } from '#lib/schemas.ts';
import { broadcast } from '#lib/server/app_stream.ts';
import { publish, type NtfyMessage } from '#lib/server/ntfy.ts';
import type { Result } from '#lib/server/queries.ts';
import { sign } from '#lib/server/server_auth.ts';
import { sendWebPush } from '#lib/server/web_push.ts';

// One notification, the same on every channel | paths are relative, browser and app each know their server
export type Push = {
    id: string
    title: string
    message: string
    task: boolean
    cursor: string                  // creation time of the occurrence, the phone resumes its stream from here
    click?: string                  // opened on a tap
    done?: { path: string, signature: string }
    snooze?: { path: string, signature: string }    // Posted with the choice, see SnoozeChoice
}

export function pushFor(note: Note, task: boolean, occurrence: Occurrence | null): Push {
    const id = occurrence?.id ?? crypto.randomUUID()
    return {
        id,
        title: note.title || 'Reminder',
        message: markdownToText(note.body).slice(0, 500) || 'Time for this note.',
        task,
        cursor: occurrence?.created ?? '',
        click: `/?note=${note.id}`,

        // Signed for this one occurrence, so it ticks off just that one however late it gets pressed
        done: task && occurrence ? { path: `/api/occurrences/${id}/done`, signature: sign(doneSubject(id)) } : undefined,
        snooze: occurrence ? { path: `/api/occurrences/${id}/snooze`, signature: sign(snoozeSubject(id)) } : undefined,
    }
}

export function doneSubject(occurrence: string){
    return `occurrence-done:${occurrence}`
}

export function snoozeSubject(occurrence: string){
    return `occurrence-snooze:${occurrence}`
}

// One result per place it tried, empty when the user has no way to get it
export async function deliver(user: User, push: Push): Promise<Result<true>[]> {
    if(user.state === 'inactive') return []

    const results = await Promise.all([toPhones(user, push), toNtfy(user, push), sendWebPush(user.id, push)])
    return results.flat()
}

// The test button of one settings row | a browser only tests itself, others may belong to someone at work
export async function deliverTest(user: User, channel: 'phone' | 'browser' | 'ntfy', endpoint?: string): Promise<Result<true>[]> {
    const push: Push = { id: crypto.randomUUID(), title: 'notifica-ex', message: 'Reminders reach this device.', task: false, cursor: '' }

    if(channel === 'phone') return toPhones(user, push)
    if(channel === 'ntfy') return await toNtfy(user, push)
    return endpoint ? await sendWebPush(user.id, push, endpoint) : []
}

function toPhones(user: User, push: Push): Result<true>[] {
    if(user.appPaused) return []
    return Array.from({ length: broadcast(user.id, push) }, () => ({ success: true as const, data: true as const, error: null }))
}

async function toNtfy(user: User, push: Push): Promise<Result<true>[]> {
    if(!user.ntfyTopic || user.ntfyPaused || !NTFY_URL) return []
    return [await publish(ntfyMessage(user.ntfyTopic, push))]
}



// NTFY ====================================================================================================
function ntfyMessage(topic: string, push: Push): NtfyMessage {
    const message: NtfyMessage = {
        topic,
        title: push.title,
        message: push.message,
        tags: [push.task ? 'ballot_box_with_check' : 'bell'],
    }
    if(!ORIGIN) return message // links need the public address
    const origin = ORIGIN.replace(/\/+$/, '')

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
            action('1 hour', snooze.path, { signature: snooze.signature, until: 'hour' }),
            action('Tomorrow', snooze.path, { signature: snooze.signature, until: 'tomorrow' }),
        ] : []),
    ]

    return message
}
