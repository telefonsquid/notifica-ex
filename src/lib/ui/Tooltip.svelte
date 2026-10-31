<script lang="ts">
    import { rise } from '#lib/motion.ts';
    import { tooltip } from '#lib/tooltip.svelte.ts';

    const GAP = 6
    const MARGIN = 8

    // Above the anchor and centred on it, below when the window edge is too close
    function place(node: HTMLElement){
        const anchor = tooltip.anchor
        if(!anchor) return

        const box = anchor.getBoundingClientRect()
        const { width, height } = node.getBoundingClientRect()
        const above = box.top - GAP - height >= MARGIN

        node.style.left = `${Math.min(Math.max(box.left + box.width / 2 - width / 2, MARGIN), innerWidth - width - MARGIN)}px`
        node.style.top = `${above ? box.top - GAP - height : box.bottom + GAP}px`
        node.style.transformOrigin = above ? 'bottom' : 'top'
    }
</script>

<!-- One hint for the whole app, see tip() in #lib/tooltip.svelte.ts -->
{#if tooltip.anchor}
    {#key tooltip.anchor}
        <div
            class="type-meta pointer-events-none fixed top-0 left-0 z-[80] max-w-64 rounded-control bg-raised px-2.5 py-1.5 text-ink shadow-[0_8px_24px_-12px_rgb(0_0_0/0.5)]"
            role="tooltip"
            {@attach place}
            in:rise|global={{ y: 4, scale: 0.95, blur: 2, duration: 'base' }}
        >
            {tooltip.text}
        </div>
    {/key}
{/if}
