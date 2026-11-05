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
<div id={id} class="section" data-section={id} role="tabpanel" aria-label={title}>
    <div class={['body', current && 'current']} inert={!current}>
        <h2 class="type-title text-xl">{title}</h2>
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
    }

    /* The hairline sits outside the body, so it stays visible beside faint sections */
    .section:not(:first-child) {
        padding-top: 1.5rem;
        border-top: 1px solid var(--theme-line-strong);
    }

    /* The last one fills the stage so it can still reach the top */
    .section:last-child {
        min-height: calc(100cqh - var(--peek));
    }

    .body {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.5rem;
        align-items: start;
        opacity: 0.22;
        transition: opacity var(--duration-slow) var(--ease-out);
    }

    .section:hover .body {
        opacity: 0.4;
    }

    .section .body.current {
        opacity: 1;
    }

    .cover {
        position: absolute;
        inset: 0;
        cursor: pointer;
    }
</style>
