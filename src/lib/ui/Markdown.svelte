<script lang="ts">
    import { renderMarkdown } from '#lib/markdown.ts';
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let { source, class: className = '' }: { source: string, class?: ClassValue } = $props()

    let html = $derived(renderMarkdown(source))
</script>

<!-- Safe to inject, the renderer escapes raw html and drops unsafe links -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class={['markdown', className]}>{@html html}</div>

<style>
    .markdown :global(:where(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4) + *) {
        margin-top: 0.6em;
    }

    .markdown :global(:where(h1, h2, h3, h4)) {
        font-stretch: 112%;
        font-weight: 650;
        color: var(--theme-ink);
    }

    .markdown :global(h1) { font-size: 1.25em; }
    .markdown :global(h2) { font-size: 1.12em; }

    .markdown :global(ul) { list-style: disc; padding-left: 1.2em; }
    .markdown :global(ol) { list-style: decimal; padding-left: 1.4em; }

    .markdown :global(a) {
        color: var(--theme-accent);
        text-decoration: underline;
        text-underline-offset: 2px;
    }

    .markdown :global(code) {
        padding: 0.1em 0.35em;
        border-radius: 0.3em;
        background: var(--theme-line);
        font-size: 0.9em;
    }

    .markdown :global(pre) {
        overflow-x: auto;
        padding: 0.75em;
        border-radius: var(--layout-radius-control);
        background: var(--theme-line);
    }

    .markdown :global(pre code) {
        padding: 0;
        background: none;
    }

    .markdown :global(blockquote) {
        padding-left: 0.8em;
        border-left: 2px solid var(--theme-line-strong);
        color: var(--theme-ink-muted);
    }

    .markdown :global(img) {
        max-width: 100%;
        border-radius: var(--layout-radius-control);
    }
</style>
