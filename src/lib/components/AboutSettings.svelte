<script lang="ts">
    import { ArrowUpRight } from '@lucide/svelte';
    import Logo from '#lib/ui/Logo.svelte';
    import { onMount } from 'svelte';
    import { getAbout } from '../../routes/api/about.remote';

    const SOURCE = 'https://github.com/telefonsquid/notifica-ex'

    const NTFY_STATES = { off: 'Not set up', reachable: 'Connected', unreachable: 'Not answering' }

    // DATA
    let about = $derived(await getAbout())

    // Only the Android app knows its own version, an older one doesn't tell
    let appVersion = $state<string | null>(null)
    onMount(() => { appVersion = window.NotificaAndroid?.appVersion?.() ?? null })
</script>

{#snippet row(name: string, value: string)}
    <div class="flex items-baseline justify-between gap-4 bg-card px-card py-3">
        <dt class="text-ink-muted">{name}</dt>
        <dd class="min-w-0 truncate text-right text-ink tabular-nums">{value}</dd>
    </div>
{/snippet}

<div class="grid gap-10">
    <div class="grid gap-6">
        <Logo class="justify-self-start" />
        <p class="text-ink-muted">Self hosted notes with labels, sharing and reminders that reach the browser, the Android app and ntfy.</p>
    </div>

    <dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
        {@render row('Version', about.version)}
        {#if appVersion}
            {@render row('Android app', appVersion)}
        {/if}
        <div class="flex items-baseline justify-between gap-4 bg-card px-card py-3">
            <dt class="text-ink-muted">Source</dt>
            <dd class="min-w-0">
                <a href={SOURCE} target="_blank" rel="noopener noreferrer" class="source inline-flex items-center gap-1 text-ink">
                    <span class="truncate">GitHub</span>
                    <ArrowUpRight class="arrow size-4 shrink-0" />
                </a>
            </dd>
        </div>
    </dl>

    {#if about.server}
        <div>
            <h3 class="type-meta mb-4 text-ink-faint">Server</h3>
            <dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
                {@render row('PocketBase', about.server.pocketbase ?? 'Unknown')}
                {@render row('ntfy', [about.server.ntfy.version, NTFY_STATES[about.server.ntfy.state]].filter(Boolean).join(' · '))}
            </dl>
        </div>
    {/if}
</div>

<style>
    .source :global(.arrow) {
        color: var(--theme-ink-faint);
        transition: translate var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
    }

    .source:hover :global(.arrow) {
        color: var(--theme-accent);
        translate: 0.125rem -0.125rem;
    }
</style>
