<script lang="ts">
    import { sortable } from '#lib/drag_list.ts';
    import { duration, easing, unfold } from '#lib/motion.ts';
    import { autoColorOrder } from '#lib/auto_colors.ts';
    import { optimisticOrder } from '#lib/optimistic_order.svelte.ts';
    import type { Label } from '#lib/schemas/notes.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { ChevronDown, ChevronUp, GripVertical } from '@lucide/svelte';
    import { flip } from 'svelte/animate';
    import { reorderAutoColors } from '../../routes/api/labels.remote';

    // PROPS
    let { labels }: { labels: Label[] } = $props()

    const order = optimisticOrder(() => autoColorOrder(labels), reorderAutoColors)
    let chart = $derived(order.items)

    // A drop has already glided to its place, the list must not animate it a second time
    let dropping = $state(false)

    function drop(from: number, to: number){
        dropping = true
        order.move(from, to)
        requestAnimationFrame(() => dropping = false)
    }
</script>

{#if chart.length > 1}
    <div class="pt-8" transition:unfold>
        <h3 class="type-meta mb-4 text-ink-faint">Auto color priority</h3>
        <ol class="grid grid-cols-1 gap-1.5 select-none" {@attach sortable(drop)}>
            {#each chart as label, index (label.id)}
                <li
                    class="row note-surface flex items-center gap-2 rounded-control border border-line py-1 pr-1 pl-2 text-ink"
                    data-note={label.color || undefined}
                    animate:flip={{ duration: dropping ? 0 : duration('base'), easing: easing('in-out') }}
                    transition:unfold
                >
                    <span class="handle grid size-8 shrink-0 place-items-center" data-drag-handle><GripVertical class="size-4" /></span>
                    <span class="min-w-0 flex-1 truncate">{label.name}</span>
                    <button class="icon-button" aria-label={`Move ${label.name} up`} disabled={index === 0} onclick={() => order.move(index, index - 1)} {@attach tip('Move up')}><ChevronUp class="size-4" /></button>
                    <button class="icon-button" aria-label={`Move ${label.name} down`} disabled={index === chart.length - 1} onclick={() => order.move(index, index + 1)} {@attach tip('Move down')}><ChevronDown class="size-4" /></button>
                </li>
            {/each}
        </ol>
    </div>
{/if}

<style>
    .row {
        cursor: grab;
    }

    /* A touch from here drags instead of scrolling the page */
    .handle {
        touch-action: none;
    }
</style>
