<script lang="ts">
    import type { Snippet } from 'svelte';

    // PROPS
    let {
        id,
        title,
        current,
        onselect,
        children
    }: {
        id: string
        title: string
        current: boolean
        onselect: () => void
        children: Snippet
    } = $props()
</script>

<!-- One stop of the settings scroll | the others stay faintly in view and a click on one moves there -->
<div id={id} class={['section', current && 'current']} data-section={id} role="tabpanel" aria-label={title}>
    <div class="body" inert={!current}>
        <h2 class="type-title text-2xl text-ink">{title}</h2>
        {@render children()}
    </div>
    {#if !current}
        <button class="cover" tabindex="-1" aria-label={`Show ${title}`} onclick={onselect}></button>
    {/if}
</div>

<style>
    .section {
        position: relative;
        margin-inline: -0.25rem;
        padding: 0.25rem 0.25rem 1.5rem;
        scroll-snap-align: start;
        opacity: 0.22;
        filter: grayscale(1);
        transition: opacity var(--duration-slow) var(--ease-out), filter var(--duration-slow) var(--ease-out);
    }

    /* The last one fills the stage so it can still reach the top */
    .section:last-child {
        min-height: calc(100cqh - var(--peek));
    }

    .section:not(.current):hover {
        opacity: 0.4;
    }

    .section.current {
        opacity: 1;
        filter: none;
    }

    /* Heading beside the content once there is room */
    .body {
        display: grid;
        gap: 1.5rem;
        align-items: start;
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
