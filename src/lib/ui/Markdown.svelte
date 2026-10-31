<script lang="ts">
    import { renderMarkdown } from '#lib/markdown.ts';
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let { source, class: className = '' }: { source: string, class?: ClassValue } = $props()

    let html = $derived(renderMarkdown(source))
</script>

<!-- Safe to inject, the renderer escapes raw html and drops unsafe links | styles live in #lib/markdown.css -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class={['markdown', className]}>{@html html}</div>
