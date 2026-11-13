<script lang="ts">
    import { resolve } from '$app/paths'
    import { page } from '$app/state'
    import Button from '#lib/ui/Button.svelte'
    import { ArrowLeft, CloudOff } from '@lucide/svelte'

    const down = $derived(page.status === 503)
</script>

<svelte:head>
    <title>{page.status} · Notifica Ex</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center px-gutter">
    {#if down}
        <div class="max-w-md">
            <CloudOff class="mb-6 size-8 text-accent" />
            <h1 class="type-display mb-4 text-5xl text-ink">The server is down.</h1>
            <p class="text-ink-muted">Your notes are safe. This page comes back by itself.</p>
        </div>
    {:else}
        <div class="max-w-md">
            <p class="type-meta mb-4 text-accent">Error {page.status}</p>
            <h1 class="type-display mb-4 text-5xl text-ink">{page.status === 404 ? 'Nothing to see here.' : 'Something broke.'}</h1>
            <p class="mb-10 text-ink-muted">{page.error?.message}</p>
            <Button href={resolve('/(app)/[[view]]', {})} style="secondary" icon={ArrowLeft}>Back to notes</Button>
        </div>
    {/if}
</main>
