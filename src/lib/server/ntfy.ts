import * as env from '$app/env/private';
import type { Result } from '#lib/server/queries.ts';

// Subset of the ntfy publish api this app uses, see https://docs.ntfy.sh/publish/#publish-as-json
export type NtfyMessage = {
    topic: string
    title?: string
    message: string
    tags?: string[]
    click?: string                  // opened when the notification is tapped
    actions?: NtfyHttpAction[]
}

type NtfyHttpAction = {
    action: 'http'
    label: string
    url: string                     // called straight from the phone, so it must be the public address
    method?: 'POST'
    headers?: Record<string, string>
    body?: string
    clear?: boolean                 // dismiss the notification once the call went through
}

// PUBLISH | Result instead of throwing, one failed topic must not stop the others
export async function publish(message: NtfyMessage): Promise<Result<true>> {
    if(!env.NTFY_URL) return { success: false, data: null, error: 'NTFY_URL is not set.' }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if(env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`

    try {
        const response = await fetch(env.NTFY_URL, { method: 'POST', headers, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) })
        if(response.ok) return { success: true, data: true, error: null }
        return { success: false, data: null, error: `ntfy answered ${response.status}: ${(await response.text()).slice(0, 200)}` }
    } catch (err) {
        return { success: false, data: null, error: `ntfy unreachable: ${err instanceof Error ? err.message : String(err)}` }
    }
}
