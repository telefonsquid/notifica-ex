<script lang="ts">
    import type { Snippet } from 'svelte';

    // PROPS
    let {
        id,
        title,
        children
    }: {
        id: string
        title: string
        children: Snippet
    } = $props()
</script>

<!-- One part of the settings scroll, a hairline sets it apart from the one before -->
<div id={id} class="section" data-section={id} role="tabpanel" aria-label={title}>
    <div class="body">
        <h2 class="type-title riso-ink text-xl">{title}</h2>
        {@render children()}
    </div>
</div>

<style>
    .section {
        margin-inline: -0.25rem;
        padding: 0.25rem 0.25rem 1.5rem;
    }

    .section:not(:first-child) {
        padding-top: 1.5rem;
        border-top: 1px solid var(--theme-line-strong);
    }

    .body {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1.5rem;
        align-items: start;
    }
</style>
