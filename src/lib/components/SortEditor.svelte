<script lang="ts">
    import Glider from '#lib/ui/Glider.svelte';
    import type { ViewSort } from '#lib/schemas.ts';
    import { BellRing, CalendarPlus, CaseSensitive, GripVertical, PencilLine, Pin } from '@lucide/svelte';

    // PROPS | every change hands back a fresh copy, the owner decides when to save
    let {
        sort,
        onchange
    }: {
        sort: ViewSort
        onchange: (sort: ViewSort) => void
    } = $props()

    function update(patch: Partial<ViewSort>){ onchange({ ...sort, ...patch }) }

    // OPTIONS | each order names its own directions, index 0 is ascending
    const SORT_BY: { value: ViewSort['by'], text: string, icon: typeof Pin, directions: [string, string] }[] = [
        { value: 'manual', text: 'Your order', icon: GripVertical, directions: ['Reversed', 'As arranged'] },
        { value: 'updated', text: 'Last edited', icon: PencilLine, directions: ['Oldest first', 'Newest first'] },
        { value: 'created', text: 'Created', icon: CalendarPlus, directions: ['Oldest first', 'Newest first'] },
        { value: 'title', text: 'Title', icon: CaseSensitive, directions: ['A to Z', 'Z to A'] },
        { value: 'reminder', text: 'Next reminder', icon: BellRing, directions: ['Soonest first', 'Latest first'] }
    ]

    const index = $derived(Math.max(0, SORT_BY.findIndex((option) => option.value === sort.by)))
    const directions = $derived(SORT_BY[index].directions.map((text, i) => ({ value: i ? 'desc' : 'asc', text })))
</script>

<div class="grid gap-4 p-4">

    <!-- ORDER | a column of choices, the thumb glides to the picked one -->
    <div class="list" role="radiogroup" aria-label="Sort by" style:--index={index}>
        <span class="thumb" aria-hidden="true"></span>
        {#each SORT_BY as option (option.value)}
            {@const Icon = option.icon}
            <button type="button" role="radio" aria-checked={sort.by === option.value} class={[sort.by === option.value && 'on']} onclick={() => update({ by: option.value })}>
                <Icon class="size-4" />{option.text}
            </button>
        {/each}
    </div>

    <!-- DIRECTION AND PINS -->
    <div class="grid gap-3 border-t border-line pt-4">
        <Glider name="Direction" options={directions} value={sort.direction} onpick={(value) => update({ direction: value as ViewSort['direction'] })} />
        <label class="flex cursor-pointer items-center gap-2.5 px-1 text-sm text-ink-muted">
            <Pin class="size-4 text-ink-faint" />
            <span class="mr-auto">Pinned first</span>
            <input type="checkbox" class="switch" checked={sort.pinnedFirst} onchange={(event) => update({ pinnedFirst: event.currentTarget.checked })} />
        </label>
    </div>
</div>

<style>
    .list {
        position: relative;
        isolation: isolate;
        display: grid;
        --row: 2.5rem;
    }

    .thumb {
        position: absolute;
        z-index: -1;
        inset-inline: 0;
        top: 0;
        height: var(--row);
        translate: 0 calc(var(--index) * 100%);
        border-radius: var(--layout-radius-control);
        background: var(--theme-accent-soft);
        transition: translate var(--duration-base) var(--ease-in-out);
    }

    .list button {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        height: var(--row);
        padding-inline: 0.75rem;
        border-radius: var(--layout-radius-control);
        color: var(--theme-ink-muted);
        font-size: 0.875rem;
        transition: color var(--duration-fast) var(--ease-out);
    }

    .list button:hover { color: var(--theme-ink); }
    .list button > :global(svg) { color: var(--theme-ink-faint); transition: color var(--duration-fast) var(--ease-out); }
    .list button.on, .list button.on > :global(svg) { color: var(--theme-accent); }

    /* SWITCH | a pill with a knob that slides across */
    .switch {
        appearance: none;
        position: relative;
        width: 2.25rem;
        height: 1.25rem;
        border-radius: 999px;
        background: var(--theme-line-strong);
        cursor: pointer;
        transition: background-color var(--duration-base) var(--ease-in-out);
    }

    .switch::after {
        content: '';
        position: absolute;
        top: 0.125rem;
        left: 0.125rem;
        width: 1rem;
        height: 1rem;
        border-radius: 999px;
        background: var(--theme-raised);
        box-shadow: 0 1px 2px color-mix(in oklab, var(--theme-ink) 20%, transparent);
        transition: translate var(--duration-base) var(--ease-in-out);
    }

    .switch:checked { background: var(--theme-accent); }
    .switch:checked::after { translate: 1rem 0; }
</style>
