<script lang="ts">
    import type { Snippet } from 'svelte';

    // PROPS
    let {
        id,
        title,
        description,
        current,
        onselect,
        children
    }: {
        id: string
        title: string
        description: string
        current: boolean
        onselect: () => void
        children: Snippet
    } = $props()
</script>

<!-- One stop of the settings stack | the others stay faintly in view and a click on one moves there -->
<div id={id} class={['section', current && 'current']} data-section={id} role="tabpanel" aria-label={title}>
    <div class="body" inert={!current}>
        <header>
            <h2 class="type-title text-2xl text-ink">{title}</h2>
            <p class="mt-2 text-ink-muted">{description}</p>
        </header>
        {@render children()}
    </div>
    {#if !current}
        <button class="cover" tabindex="-1" aria-label={`Show ${title}`} onclick={onselect}></button>
    {/if}
</div>

<style>
    /* Capped to the stage minus both peeks, so only the current one scrolls and never into its neighbours */
    .section {
        position: relative;
        max-height: calc(100cqh - 2 * var(--peek));
        margin-inline: -0.25rem;
        padding: 0.25rem 0.25rem 1.5rem;
        overflow: hidden;
        opacity: 0.22;
        filter: grayscale(1);
        overscroll-behavior: contain;
        scrollbar-width: thin;
        transition: opacity var(--duration-slow) var(--ease-out), filter var(--duration-slow) var(--ease-out);
    }

    .section:not(.current):hover {
        opacity: 0.4;
    }

    .section.current {
        overflow-y: auto;
        opacity: 1;
        filter: none;
    }

    /* Heading beside the content once there is room */
    .body {
        display: grid;
        gap: 1.5rem;
    }

    @media (width >= 80rem) {
        .body {
            grid-template-columns: 14rem minmax(0, 1fr);
            gap: 3rem;
        }
    }

    .cover {
        position: absolute;
        inset: 0;
        cursor: pointer;
    }
</style>
