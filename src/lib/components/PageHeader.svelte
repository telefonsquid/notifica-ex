<script lang="ts">
    import type { Snippet } from 'svelte';

    // PROPS
    let {
        eyebrow,
        title,
        actions
    }: {
        eyebrow?: string
        title: string
        actions?: Snippet
    } = $props()
</script>

<header class="mb-10 flex flex-wrap items-end justify-between gap-6 sm:mb-14">
    <div>
        {#if eyebrow}
            <p class="type-meta mb-3 text-accent">{eyebrow}</p>
        {/if}
        <h1 class="type-display text-5xl text-ink sm:text-7xl">{title}</h1>
    </div>
    {#if actions}
        <div class="flex items-center gap-2">{@render actions()}</div>
    {/if}
</header>
