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
    }
}

export function doneSubject(occurrence: string){
    return `occurrence-done:${occurrence}`
}

// One result per place it tried, empty when the user has no way to get it
export async function deliver(user: User, push: Push): Promise<Result<true>[]> {
    if(user.state === 'inactive') return []

    const reached = broadcast(user.id, push)
    const [ntfy, browsers] = await Promise.all([
        user.ntfyTopic && !user.ntfyPaused && NTFY_URL ? publish(ntfyMessage(user.ntfyTopic, push)) : null,
        sendWebPush(user.id, push),
    ])

    return [
        ...Array.from({ length: reached }, () => ({ success: true as const, data: true as const, error: null })),
        ...(ntfy ? [ntfy] : []),
        ...browsers,
    ]
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
    if(push.done){
        message.actions = [{
            action: 'http',
            label: 'Done',
            url: origin + push.done.path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signature: push.done.signature }),
            clear: true,
        }]
    }

    return message
}
