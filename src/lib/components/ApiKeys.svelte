<script lang="ts">
    import { page } from '$app/state';
    import { unfold } from '#lib/motion.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { ApiKeyScope, ApiKeySummary } from '#lib/schemas/api_keys.ts';
    import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
    import { formatDay } from '#lib/time_format.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import Glider from '#lib/ui/Glider.svelte';
    import { Copy, Plus, Trash2, X } from '@lucide/svelte';
    import { createApiKey, getApiKeys, revokeApiKey } from '../../routes/api/api_keys.remote';

    // Keys an AI uses to reach this account through the MCP server

    // DATA
    let keys = $derived(await getApiKeys())

    const address = $derived(`${page.url.origin}/mcp`)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

    const SCOPES = [
        { value: 'read', text: 'Read only' },
        { value: 'write', text: 'Read and write' }
    ] satisfies { value: ApiKeyScope, text: string }[]

    const EXPIRIES = [
        { value: '30', text: '30 days' },
        { value: '365', text: '1 year' },
        { value: 'never', text: 'Never' }
    ]

    // NEW KEY
    let name = $state('')
    let scope = $state<ApiKeyScope>('write')
    let expiry = $state('365')
    let creating = $state(false)
    let fresh = $state<string | null>(null)     // Shown until dismissed, the server keeps only its hash

    async function create() {
        creating = true
        const created = await safeAction(createApiKey({ name, scope, days: expiry === 'never' ? null : Number(expiry) }))
        creating = false
        if(!created) return

        fresh = created.key
        name = ''
    }

    async function revoke(key: ApiKeySummary) {
        const confirmed = await confirmAction({
            title: `Revoke ${key.name}?`,
            message: 'Anything using this key loses access at once. This cannot be undone.',
            action: 'Revoke'
        })
        if(confirmed) await safeAction(revokeApiKey(key.id))
    }

    async function copy(text: string) {
        await navigator.clipboard.writeText(text)
        notify('Copied.')
    }

    // LABELS
    function details(key: ApiKeySummary) {
        const now = Date.now()
        return [
            key.scope === 'write' ? 'Read and write' : 'Read only',
            key.lastUsed ? `used ${formatDay(key.lastUsed, zone, now).toLowerCase()}` : 'never used',
            key.expires ? (new Date(key.expires).getTime() <= now ? 'expired' : `expires ${formatDay(key.expires, zone, now)}`) : null
        ].filter(Boolean).join(' · ')
    }
</script>

<div class="grid gap-4">
    <h3 class="type-meta text-ink-faint">AI access</h3>

    <dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
        <div class="flex items-center justify-between gap-4 bg-card py-3 pr-3 pl-card">
            <dt class="shrink-0 text-ink-muted">MCP address</dt>
            <dd class="flex min-w-0 items-center gap-2">
                <code class="min-w-0 truncate text-ink">{address}</code>
                <button type="button" class="icon-button" aria-label="Copy address" onclick={() => copy(address)} {@attach tip('Copy address')}><Copy class="size-4" /></button>
            </dd>
        </div>

        {#each keys as key (key.id)}
            <div class="flex items-center gap-4 bg-card py-3 pr-3 pl-card" transition:unfold>
                <span class="min-w-0 flex-1">
                    <span class="type-title block truncate text-ink">{key.name}</span>
                    <span class="type-meta block text-ink-faint"><code class="normal-case">{key.prefix}…</code> · {details(key)}</span>
                </span>
                <button type="button" class="icon-button" aria-label="Revoke {key.name}" onclick={() => revoke(key)} {@attach tip('Revoke')}><Trash2 class="size-4" /></button>
            </div>
        {/each}
    </dl>

    {#if fresh}
        <div class="grid gap-3 rounded-card border border-accent bg-card p-card" transition:unfold>
            <div class="flex items-start justify-between gap-3">
                <p class="text-ink">Copy the key now, it won't show again.</p>
                <button type="button" class="icon-button" aria-label="Close" onclick={() => (fresh = null)}><X class="size-4" /></button>
            </div>
            <div class="flex items-center gap-2 rounded-control bg-raised py-2 pr-2 pl-4">
                <code class="min-w-0 flex-1 break-all text-ink">{fresh}</code>
                <button type="button" class="icon-button" aria-label="Copy key" onclick={() => copy(fresh ?? '')} {@attach tip('Copy key')}><Copy class="size-4" /></button>
            </div>
        </div>
    {/if}

    {#if keys.length < LIMITS.API_KEYS}
        <form class="grid gap-3" onsubmit={(event) => { event.preventDefault(); create(); }}>
            <div class="flex items-baseline justify-between gap-4 rounded-card border border-line bg-card px-card py-2.5">
                <label for="api-key-name" class="text-ink-muted">Name</label>
                <input id="api-key-name" bind:value={name} maxlength={LIMITS.API_KEY_NAME} placeholder="Claude on my laptop" required class="min-w-0 flex-1 bg-transparent py-1.5 text-right text-ink outline-none placeholder:text-ink-faint" />
            </div>
            <div class="flex flex-wrap items-center gap-3">
                <Glider name="Access" options={SCOPES} value={scope} onpick={(value) => (scope = value)} />
                <Glider name="Expires" options={EXPIRIES} value={expiry} onpick={(value) => (expiry = value)} />
                <Button type="submit" style="ghost" class="ml-auto" icon={Plus} loading={creating} disabled={!name.trim()}>New key</Button>
            </div>
        </form>
    {/if}
</div>
