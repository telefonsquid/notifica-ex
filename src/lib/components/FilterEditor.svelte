<script lang="ts">
    import { colorName } from '#lib/notes.ts';
    import { NOTE_SOLIDS, NOTE_STICKIES, NOTE_TEXTURES, NOTE_TINTS, type DateRange, type Label, type NoteColor, type ViewFilter, type ViewSort } from '#lib/schemas.ts';
    import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ChevronDown, Minus } from '@lucide/svelte';
    import { slide } from 'svelte/transition';

    // PROPS | every change hands back a fresh copy, the owner decides when to save
    let {
        filter,
        sort,
        labels,
        onchange
    }: {
        filter: ViewFilter
        sort: ViewSort
        labels: Label[]
        onchange: (filter: ViewFilter, sort: ViewSort) => void
    } = $props()

    function update(patch: Partial<ViewFilter>){ onchange({ ...filter, ...patch }, sort) }
    function updateRange(key: 'created' | 'updated' | 'due', patch: Partial<DateRange>){ update({ [key]: { ...filter[key], ...patch } }) }
    function updateSort(patch: Partial<ViewSort>){ onchange(filter, { ...sort, ...patch }) }

    // OPTIONS
    const PINNED: [ViewFilter['pinned'], string][] = [['any', 'Any'], ['only', 'Only'], ['hide', 'Hide']]
    const ARCHIVED: [ViewFilter['archived'], string][] = [['hide', 'Hide'], ['only', 'Only'], ['any', 'Both']]
    const CHECKLIST: [ViewFilter['list'], string][] = [['any', 'Any'], ['open', 'Open'], ['complete', 'Done']]
    const LABELLED: [ViewFilter['labelled'], string][] = [['any', 'Any'], ['with', 'Labelled'], ['without', 'Unlabelled']]
    const MATCH: [ViewFilter['labelMatch'], string][] = [['any', 'Any of them'], ['all', 'All of them']]
    const REMINDER: [ViewFilter['reminder'], string][] = [
        ['any', 'Any'], ['with', 'Has one'], ['without', 'None'], ['upcoming', 'Upcoming'],
        ['repeating', 'Repeating'], ['tasks', 'Tasks'], ['waiting', 'Unchecked'], ['finished', 'Finished']
    ]
    const COLORS: NoteColor[] = ['', ...NOTE_TINTS, ...NOTE_SOLIDS, ...NOTE_STICKIES, ...NOTE_TEXTURES]
    const DATES: { key: 'created' | 'updated' | 'due', name: string, within: string, beyond: string }[] = [
        { key: 'created', name: 'Created', within: 'In the last', beyond: 'Longer ago than' },
        { key: 'updated', name: 'Edited', within: 'In the last', beyond: 'Longer ago than' },
        { key: 'due', name: 'Reminder due', within: 'In the next', beyond: 'Later than' }
    ]
    const SORT_BY: [ViewSort['by'], string][] = [['updated', 'Last edited'], ['created', 'Created'], ['title', 'Title'], ['reminder', 'Next reminder']]
    const DIRECTION: Record<ViewSort['by'], [string, string]> = {
        updated: ['Oldest first', 'Newest first'],
        created: ['Oldest first', 'Newest first'],
        title: ['A to Z', 'Z to A'],
        reminder: ['Soonest first', 'Latest first']
    }

    // LABELS | each click moves a label one step: ignored, included, excluded
    function stateOf(id: string): 'include' | 'exclude' | null {
        if(filter.include.includes(id)) return 'include'
        if(filter.exclude.includes(id)) return 'exclude'
        return null
    }

    function cycleLabel(id: string){
        const state = stateOf(id)
        const include = filter.include.filter((item) => item !== id)
        const exclude = filter.exclude.filter((item) => item !== id)
        if(state === null) include.push(id)
        if(state === 'include') exclude.push(id)
        update({ include, exclude })
    }

    function toggle<T>(list: T[], value: T): T[] {
        return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
    }

    let showColors = $state(false)
</script>

{#snippet segmented(name: string, options: [string, string][], current: string, pick: (value: string) => void)}
    <div class="segmented" role="group" aria-label={name}>
        {#each options as [value, text] (value)}
            <button type="button" class={[current === value && 'on']} aria-pressed={current === value} onclick={() => pick(value)}>{text}</button>
        {/each}
    </div>
{/snippet}

<div class="filter-editor grid gap-6">

    <!-- WORDS -->
    <fieldset>
        <legend class="type-meta">Words</legend>
        <div class="grid gap-2 min-[28rem]:grid-cols-2">
            <input class="field" value={filter.words} placeholder="Contains all of" aria-label="Words the note contains" oninput={(event) => update({ words: event.currentTarget.value })} />
            <input class="field" value={filter.without} placeholder="Leaves out" aria-label="Words the note leaves out" oninput={(event) => update({ without: event.currentTarget.value })} />
        </div>
        <button type="button" class={['chip mt-2', filter.titleOnly && 'on']} aria-pressed={filter.titleOnly} onclick={() => update({ titleOnly: !filter.titleOnly })}>
            {#if filter.titleOnly}<Check class="size-3" />{/if}Title only
        </button>
    </fieldset>

    <!-- LABELS -->
    <fieldset>
        <legend class="type-meta">Labels</legend>
        {#if labels.length}
            <p class="hint">Click once to include, twice to exclude.</p>
            <div class="flex flex-wrap gap-1.5">
                {#each labels as label (label.id)}
                    {@const state = stateOf(label.id)}
                    <button
                        type="button"
                        class={['chip', state === 'include' && 'on', state === 'exclude' && 'off']}
                        aria-label={`${label.name}: ${state === 'include' ? 'included' : state === 'exclude' ? 'excluded' : 'ignored'}`}
                        onclick={() => cycleLabel(label.id)}
                    >
                        {#if state === 'include'}<Check class="size-3" />{:else if state === 'exclude'}<Minus class="size-3" />{:else}<span class="note-mark h-1.5 w-3 rounded-full" data-note={label.color || undefined}></span>{/if}
                        <span class="name">{label.name}</span>
                    </button>
                {/each}
            </div>
        {/if}
        <div class="mt-3 flex flex-wrap gap-2">
            {@render segmented('Labelled', LABELLED, filter.labelled, (value) => update({ labelled: value as ViewFilter['labelled'] }))}
            {#if filter.include.length > 1}
                {@render segmented('Included labels', MATCH, filter.labelMatch, (value) => update({ labelMatch: value as ViewFilter['labelMatch'] }))}
            {/if}
        </div>
    </fieldset>

    <!-- STATE -->
    <div class="grid gap-6 min-[28rem]:grid-cols-2">
        <fieldset>
            <legend class="type-meta">Checklist</legend>
            {@render segmented('Checklist', CHECKLIST, filter.list, (value) => update({ list: value as ViewFilter['list'] }))}
        </fieldset>
        <fieldset>
            <legend class="type-meta">Pinned</legend>
            {@render segmented('Pinned', PINNED, filter.pinned, (value) => update({ pinned: value as ViewFilter['pinned'] }))}
        </fieldset>
        <fieldset>
            <legend class="type-meta">Archived</legend>
            {@render segmented('Archived', ARCHIVED, filter.archived, (value) => update({ archived: value as ViewFilter['archived'] }))}
        </fieldset>
    </div>

    <!-- REMINDER -->
    <fieldset>
        <legend class="type-meta">Reminder</legend>
        <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reminder">
            {#each REMINDER as [value, text] (value)}
                <button type="button" class={['chip', filter.reminder === value && 'on']} role="radio" aria-checked={filter.reminder === value} onclick={() => update({ reminder: value })}>{text}</button>
            {/each}
        </div>
    </fieldset>

    <!-- COLOR | folded away, the palette is long -->
    <fieldset>
        <legend class="type-meta">Color</legend>
        <button type="button" class="chip" aria-expanded={showColors} onclick={() => showColors = !showColors}>
            {#if filter.colors.length}
                <span class="flex -space-x-1">
                    {#each filter.colors.slice(0, 5) as color (color)}
                        <span class="note-surface size-3 rounded-full border border-line-strong" data-note={color || undefined}></span>
                    {/each}
                </span>
                {filter.colors.length === 1 ? colorName(filter.colors[0]) : `${filter.colors.length} colors`}
            {:else}
                Any color
            {/if}
            <ChevronDown class={['size-3 transition-transform', showColors && 'rotate-180']} />
        </button>
        {#if showColors}
            <div class="mt-3 flex flex-wrap gap-1.5" transition:slide={{ duration: 200 }}>
                {#each COLORS as color (color)}
                    {@const on = filter.colors.includes(color)}
                    <button
                        type="button"
                        class={['swatch note-surface grid size-6 place-items-center rounded-full border border-line-strong text-ink', on && 'on']}
                        data-note={color || undefined}
                        aria-pressed={on}
                        aria-label={colorName(color)}
                        title={colorName(color)}
                        onclick={() => update({ colors: toggle(filter.colors, color) })}
                    >
                        {#if on}<Check class="size-3" strokeWidth={3} />{/if}
                    </button>
                {/each}
                {#if filter.colors.length}
                    <button type="button" class="type-meta ml-1 text-ink-faint hover:text-ink" onclick={() => update({ colors: [] })}>Clear</button>
                {/if}
            </div>
        {/if}
    </fieldset>

    <!-- DATES -->
    <fieldset>
        <legend class="type-meta">Dates</legend>
        <div class="grid gap-2">
            {#each DATES as date (date.key)}
                {@const range = filter[date.key]}
                <div class="flex flex-wrap items-center gap-2">
                    <span class="w-28 shrink-0 text-ink-muted">{date.name}</span>
                    <select class="field" value={range.mode} aria-label={`${date.name} filter`} onchange={(event) => updateRange(date.key, { mode: event.currentTarget.value as DateRange['mode'] })}>
                        <option value="any">Any time</option>
                        <option value="within">{date.within}</option>
                        <option value="beyond">{date.beyond}</option>
                        <option value="between">Between</option>
                    </select>
                    {#if range.mode === 'within' || range.mode === 'beyond'}
                        <input
                            class="field w-16"
                            type="number"
                            min="1"
                            max="999"
                            value={range.amount}
                            aria-label="Amount"
                            onchange={(event) => updateRange(date.key, { amount: Math.min(999, Math.max(1, Math.round(event.currentTarget.valueAsNumber) || 1)) })}
                        />
                        <select class="field" value={range.unit} aria-label="Unit" onchange={(event) => updateRange(date.key, { unit: event.currentTarget.value as DateRange['unit'] })}>
                            <option value="days">days</option>
                            <option value="weeks">weeks</option>
                            <option value="months">months</option>
                        </select>
                    {:else if range.mode === 'between'}
                        <input class="field" type="date" value={range.from} aria-label="From" onchange={(event) => updateRange(date.key, { from: event.currentTarget.value })} />
                        <span class="text-ink-faint">and</span>
                        <input class="field" type="date" value={range.to} aria-label="To" onchange={(event) => updateRange(date.key, { to: event.currentTarget.value })} />
                    {/if}
                </div>
            {/each}
        </div>
    </fieldset>

    <!-- SORT -->
    <fieldset>
        <legend class="type-meta">Order</legend>
        <div class="flex flex-wrap items-center gap-2">
            <select class="field" value={sort.by} aria-label="Sort by" onchange={(event) => updateSort({ by: event.currentTarget.value as ViewSort['by'] })}>
                {#each SORT_BY as [value, text] (value)}
                    <option {value}>{text}</option>
                {/each}
            </select>
            <button type="button" class="chip" onclick={() => updateSort({ direction: sort.direction === 'asc' ? 'desc' : 'asc' })}>
                {#if sort.direction === 'asc'}<ArrowUpNarrowWide class="size-3.5" />{:else}<ArrowDownWideNarrow class="size-3.5" />{/if}
                {DIRECTION[sort.by][sort.direction === 'asc' ? 0 : 1]}
            </button>
            <button type="button" class={['chip', sort.pinnedFirst && 'on']} aria-pressed={sort.pinnedFirst} onclick={() => updateSort({ pinnedFirst: !sort.pinnedFirst })}>
                {#if sort.pinnedFirst}<Check class="size-3" />{/if}Pinned first
            </button>
        </div>
    </fieldset>

</div>

<style>
    legend {
        margin-bottom: 0.625rem;
        color: var(--theme-ink-faint);
    }

    .hint {
        margin: -0.25rem 0 0.625rem;
        font-size: 0.8125rem;
        color: var(--theme-ink-faint);
    }

    .field {
        height: 2.25rem;
        min-width: 0;
        padding-inline: 0.75rem;
        border: 1px solid var(--theme-line);
        border-radius: var(--layout-radius-control);
        background: var(--theme-card);
        color: var(--theme-ink);
        color-scheme: inherit;
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .field:hover { border-color: var(--theme-line-strong); }
    .field:focus { border-color: var(--theme-accent); outline: none; }

    /* CHIPS | included ones take the accent, excluded ones get struck through */
    .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.3125rem 0.75rem;
        border: 1px solid var(--theme-line);
        border-radius: 999px;
        color: var(--theme-ink-muted);
        font-size: 0.875rem;
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .chip:hover { border-color: var(--theme-line-strong); color: var(--theme-ink); }
    .chip:active { scale: 0.95; }

    .chip.on {
        border-color: var(--theme-accent);
        background: var(--theme-accent-soft);
        color: var(--theme-accent);
    }

    .chip.off {
        border-style: dashed;
        color: var(--theme-ink-faint);
    }

    .chip.off .name { text-decoration: line-through; }

    /* SEGMENTED */
    .segmented {
        display: inline-flex;
        gap: 0.125rem;
        padding: 0.1875rem;
        border-radius: 999px;
        background: var(--theme-line);
    }

    .segmented button {
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        color: var(--theme-ink-faint);
        font-size: 0.875rem;
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .segmented button:hover { color: var(--theme-ink-muted); }

    .segmented button.on {
        background: var(--theme-card);
        color: var(--theme-ink);
    }

    .swatch {
        transition: scale var(--duration-base) var(--ease-spring);
    }

    .swatch:hover { scale: 1.12; }
    .swatch.on { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
</style>
