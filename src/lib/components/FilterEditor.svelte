<script lang="ts">
    import { cssEasing, duration, morph, unfold } from '#lib/motion.ts';
    import { COLOR_GROUPS, colorName } from '#lib/notes.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Glider, { type GliderOption } from '#lib/ui/Glider.svelte';
    import NumberField from '#lib/ui/NumberField.svelte';
    import { emptyFilter } from '#lib/views.ts';
    import type { DateRange, Label, ViewFilter } from '#lib/schemas.ts';
    import { Archive, Bell, CalendarRange, CaseSensitive, Check, ChevronDown, ListChecks, Minus, Palette, Pin, RotateCcw, SlidersHorizontal, Tag, TextSearch, X } from '@lucide/svelte';
    import { untrack, type Snippet } from 'svelte';
    import { fade } from 'svelte/transition';

    // PROPS | every change hands back a fresh copy, the owner decides when to save
    let {
        filter,
        labels,
        onchange,
        footer,
        class: boxClass
    }: {
        filter: ViewFilter
        labels: Label[]
        onchange: (filter: ViewFilter) => void
        footer?: Snippet                // closes the box, below the scrolling part
        class?: string                  // the box, the mode switch floats above it
    } = $props()

    function update(patch: Partial<ViewFilter>){ onchange({ ...filter, ...patch }) }
    function updateRange(key: 'created' | 'updated' | 'due', patch: Partial<DateRange>){ update({ [key]: { ...filter[key], ...patch } }) }

    function clear(...keys: (keyof ViewFilter)[]){
        const empty = emptyFilter()
        update(Object.fromEntries(keys.map((key) => [key, empty[key]])))
    }

    // OPTIONS
    type Icon = typeof Tag
    type Option = GliderOption

    const PINNED: Option[] = [{ value: 'any', text: 'Any' }, { value: 'only', text: 'Only' }, { value: 'hide', text: 'Hide' }]
    const ARCHIVED: Option[] = [{ value: 'hide', text: 'Active' }, { value: 'only', text: 'Archived' }, { value: 'any', text: 'Both' }]
    const CHECKLIST: Option[] = [{ value: 'any', text: 'Any' }, { value: 'open', text: 'Open' }, { value: 'complete', text: 'Done' }]
    const LABELLED: Option[] = [{ value: 'any', text: 'Any' }, { value: 'with', text: 'Labelled' }, { value: 'without', text: 'Unlabelled' }]
    const MATCH: Option[] = [{ value: 'any', text: 'Any of them' }, { value: 'all', text: 'All of them' }]
    const REMINDER: [ViewFilter['reminder'], string][] = [
        ['any', 'Any'], ['with', 'Has one'], ['without', 'None'], ['upcoming', 'Upcoming'],
        ['repeating', 'Repeating'], ['tasks', 'Tasks'], ['waiting', 'Unchecked'], ['finished', 'Finished']
    ]
    const DATES: { key: 'created' | 'updated' | 'due', name: string, within: string, beyond: string }[] = [
        { key: 'created', name: 'Created', within: 'In the last', beyond: 'Longer ago than' },
        { key: 'updated', name: 'Edited', within: 'In the last', beyond: 'Longer ago than' },
        { key: 'due', name: 'Reminder due', within: 'In the next', beyond: 'Later than' }
    ]

    // MODES | simple holds the everyday filters, advanced all of them
    // Counts what only advanced shows, so simple can tell that more applies
    const hidden = $derived([
        filter.without, filter.titleOnly, filter.exclude.length, filter.labelled !== 'any',
        filter.include.length > 1 && filter.labelMatch === 'all', filter.pinned === 'hide',
        !['any', 'with'].includes(filter.reminder), filter.list === 'complete', filter.colors.length,
        ...DATES.map((date) => filter[date.key].mode !== 'any')
    ].filter(Boolean).length)

    let tab = $state(untrack(() => hidden) ? 'advanced' : 'simple')

    const filtered = $derived(JSON.stringify(filter) !== JSON.stringify(emptyFilter()))
    const active = $derived({
        words: !!filter.words || !!filter.without || filter.titleOnly,
        labels: filter.include.length > 0 || filter.exclude.length > 0 || filter.labelled !== 'any',
        state: filter.pinned !== 'any' || filter.archived !== 'hide' || filter.list !== 'any',
        reminder: filter.reminder !== 'any',
        colors: filter.colors.length > 0,
        dates: DATES.some((date) => filter[date.key].mode !== 'any')
    })

    // LABELS | simple only picks, advanced cycles through ignored, included and excluded
    function stateOf(id: string): 'include' | 'exclude' | null {
        if(filter.include.includes(id)) return 'include'
        if(filter.exclude.includes(id)) return 'exclude'
        return null
    }

    function stepLabel(id: string, cycle: boolean){
        const state = stateOf(id)
        const include = filter.include.filter((item) => item !== id)
        const exclude = filter.exclude.filter((item) => item !== id)
        if(state === null) include.push(id)
        if(state === 'include' && cycle) exclude.push(id)
        update({ include, exclude })
    }

    function toggle<T>(list: T[], value: T): T[] {
        return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
    }

    // ARCHIVE | one button steps through active only, archived only and both
    const ARCHIVE_STEPS: Record<ViewFilter['archived'], { next: ViewFilter['archived'], text: string }> = {
        hide: { next: 'only', text: 'Archived hidden' },
        only: { next: 'any', text: 'Archived only' },
        any: { next: 'hide', text: 'Archived included' }
    }

    let showColors = $state(untrack(() => filter.colors.length > 0))

    // Mode switches morph the height, the popover grows with it
    const morphing = morph(() => ({ duration: duration('base'), easing: cssEasing('in-out') }))
</script>

<!-- SNIPPETS ==================================================================================================== -->
{#snippet labelChip(label: Label, cycle: boolean)}
    {@const state = stateOf(label.id)}
    <button
        type="button"
        class={['label-chip note-mark type-meta', state, !state && filter.include.length > 0 && 'dim']}
        data-note={label.color || undefined}
        aria-label={`${label.name}: ${state === 'include' ? 'included' : state === 'exclude' ? 'left out' : 'ignored'}`}
        onclick={() => stepLabel(label.id, cycle)}
    >
        {#if state === 'include'}<Check class="size-3" strokeWidth={3} />{:else if state === 'exclude'}<Minus class="size-3" strokeWidth={3} />{/if}
        <span class="name">{label.name}</span>
    </button>
{/snippet}

{#snippet toggleChip(Icon: Icon | null, text: string, on: boolean, flip: () => void)}
    <button type="button" class={['chip', on && 'on']} aria-pressed={on} onclick={flip}>
        {#if Icon}<Icon class="size-3.5" />{/if}{text}
    </button>
{/snippet}

{#snippet iconToggle(Icon: Icon, text: string, on: boolean, flip: () => void)}
    <button type="button" class={['icon-toggle', on && 'on']} aria-label={text} aria-pressed={on} onclick={flip} {@attach tip(text)}>
        <Icon class="size-4" />
    </button>
{/snippet}

{#snippet section(title: string, Icon: Icon, on: boolean, keys: (keyof ViewFilter)[], body: Snippet)}
    <section class="section">
        <header class="mb-3 flex h-5 items-center gap-2">
            <Icon class={['size-3.5 transition-colors', on ? 'text-accent' : 'text-ink-faint']} />
            <h3 class="type-meta text-ink-faint">{title}</h3>
            {#if on}
                <button type="button" class="reset type-meta ml-auto" onclick={() => clear(...keys)} transition:fade={{ duration: duration('fast') }}>Clear</button>
            {/if}
        </header>
        {@render body()}
    </section>
{/snippet}


<!-- EDITOR ==================================================================================================== -->
<div class="flex min-h-0 flex-1 flex-col gap-2">

    <!-- MODE | floats above the box, names the other mode, advanced counts what simple can't show -->
    <div class="flex items-center justify-end gap-1.5">
        {#if filtered}
            <button type="button" class="float type-meta" onclick={() => onchange(emptyFilter())} transition:fade={{ duration: duration('fast') }}>
                <RotateCcw class="size-3" />Clear
            </button>
        {/if}
        <button type="button" class="float type-meta" onclick={() => tab = tab === 'simple' ? 'advanced' : 'simple'}>
            {tab === 'simple' ? 'Advanced' : 'Simple'}
            {#if tab === 'simple' && hidden}<span class="badge">{hidden}</span>{/if}
        </button>
    </div>

    <div class={['flex min-h-0 flex-1 flex-col', boxClass]}>
        <div class="min-h-0 overflow-y-auto" {@attach morphing}>
            <div>
                {#key tab}
                    <div class="p-5" in:fade={{ duration: duration('base') }}>
                        {#if tab === 'simple'}{@render simple()}{:else}{@render advanced()}{/if}
                    </div>
                {/key}
            </div>
        </div>
        {@render footer?.()}
    </div>
</div>


<!-- SIMPLE ==================================================================================================== -->
{#snippet simple()}
    <div class="grid gap-4">
        <div class="flex flex-wrap items-center gap-2">
            <label class="search">
                <TextSearch class="size-4 shrink-0 text-ink-faint" />
                <input value={filter.words} aria-label="Words the note contains" oninput={(event) => update({ words: event.currentTarget.value })} />
                {#if filter.words}
                    <button type="button" class="icon-button rounded-full p-1" aria-label="Clear words" onclick={() => update({ words: '' })}><X class="size-3.5" /></button>
                {/if}
            </label>
            <div class="flex gap-1">
                {@render iconToggle(Pin, 'Pinned only', filter.pinned === 'only', () => update({ pinned: filter.pinned === 'only' ? 'any' : 'only' }))}
                {@render iconToggle(Bell, 'With reminder', filter.reminder === 'with', () => update({ reminder: filter.reminder === 'with' ? 'any' : 'with' }))}
                {@render iconToggle(ListChecks, 'Open tasks', filter.list === 'open', () => update({ list: filter.list === 'open' ? 'any' : 'open' }))}
                <button
                    type="button"
                    class={['icon-toggle', filter.archived === 'only' && 'on', filter.archived === 'any' && 'half']}
                    aria-label={ARCHIVE_STEPS[filter.archived].text}
                    onclick={() => update({ archived: ARCHIVE_STEPS[filter.archived].next })}
                    {@attach tip(ARCHIVE_STEPS[filter.archived].text)}
                >
                    <Archive class="size-4" />
                </button>
            </div>
        </div>

        {#if labels.length}
            <div class="flex flex-wrap gap-1.5">
                {#each labels as label (label.id)}{@render labelChip(label, false)}{/each}
            </div>
        {/if}
    </div>
{/snippet}


<!-- ADVANCED ==================================================================================================== -->
{#snippet advanced()}
    <div class="grid">
        {@render section('Words', TextSearch, active.words, ['words', 'without', 'titleOnly'], words)}
        {@render section('Labels', Tag, active.labels, ['include', 'exclude', 'labelled', 'labelMatch'], labelFilters)}
        {@render section('State', SlidersHorizontal, active.state, ['pinned', 'archived', 'list'], states)}
        {@render section('Reminder', Bell, active.reminder, ['reminder'], reminders)}
        {@render section('Color', Palette, active.colors, ['colors'], colors)}
        {@render section('Dates', CalendarRange, active.dates, ['created', 'updated', 'due'], dates)}
    </div>
{/snippet}

{#snippet words()}
    <div class="grid gap-2 min-[28rem]:grid-cols-2">
        <input class="field" value={filter.words} placeholder="Contains all of" aria-label="Words the note contains" oninput={(event) => update({ words: event.currentTarget.value })} />
        <input class="field" value={filter.without} placeholder="Leaves out" aria-label="Words the note leaves out" oninput={(event) => update({ without: event.currentTarget.value })} />
    </div>
    <div class="mt-2">
        {@render toggleChip(CaseSensitive, 'Title only', filter.titleOnly, () => update({ titleOnly: !filter.titleOnly }))}
    </div>
{/snippet}

{#snippet labelFilters()}
    {#if labels.length}
        <div class="flex flex-wrap gap-1.5">
            {#each labels as label (label.id)}{@render labelChip(label, true)}{/each}
        </div>
        <p class="hint">Click once to include, twice to leave out.</p>
    {/if}
    <div class="row">
        <span>Notes</span>
        <Glider name="Labelled" options={LABELLED} value={filter.labelled} onpick={(value) => update({ labelled: value as ViewFilter['labelled'] })} />
    </div>
    {#if filter.include.length > 1}
        <div class="row" transition:unfold>
            <span>Need</span>
            <Glider name="Included labels" options={MATCH} value={filter.labelMatch} onpick={(value) => update({ labelMatch: value as ViewFilter['labelMatch'] })} />
        </div>
    {/if}
{/snippet}

{#snippet states()}
    <div>
        <div class="row"><span>Pinned</span><Glider name="Pinned" options={PINNED} value={filter.pinned} onpick={(value) => update({ pinned: value as ViewFilter['pinned'] })} /></div>
        <div class="row"><span>Archive</span><Glider name="Archived" options={ARCHIVED} value={filter.archived} onpick={(value) => update({ archived: value as ViewFilter['archived'] })} /></div>
        <div class="row"><span>Checklist</span><Glider name="Checklist" options={CHECKLIST} value={filter.list} onpick={(value) => update({ list: value as ViewFilter['list'] })} /></div>
    </div>
{/snippet}

{#snippet reminders()}
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reminder">
        {#each REMINDER as [value, text] (value)}
            <button type="button" class={['chip', filter.reminder === value && 'on']} role="radio" aria-checked={filter.reminder === value} onclick={() => update({ reminder: value })}>{text}</button>
        {/each}
    </div>
{/snippet}

<!-- The palette is long, it stays folded until asked for -->
{#snippet colors()}
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
        <div class="grid gap-3 pt-3" transition:unfold>
            {#each COLOR_GROUPS as group (group.name)}
                <div>
                    <p class="type-meta mb-1.5 text-ink-faint">{group.name}</p>
                    <div class="grid grid-cols-9 gap-1.5">
                        {#each group.colors as color (color)}
                            {@const on = filter.colors.includes(color)}
                            <button
                                type="button"
                                class={['swatch note-surface grid aspect-square place-items-center rounded-full border border-line-strong text-ink', on && 'on']}
                                data-note={color || undefined}
                                aria-pressed={on}
                                aria-label={colorName(color)}
                                {@attach tip(colorName(color))}
                                onclick={() => update({ colors: toggle(filter.colors, color) })}
                            >
                                {#if on}<Check class="size-3" strokeWidth={3} />{/if}
                            </button>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
{/snippet}

{#snippet dates()}
    <div class="grid gap-2">
        {#each DATES as date (date.key)}
            {@const range = filter[date.key]}
            <div class="flex flex-wrap items-center gap-2">
                <span class="w-24 shrink-0 text-sm text-ink-muted">{date.name}</span>
                <select class="field" value={range.mode} aria-label={`${date.name} filter`} onchange={(event) => updateRange(date.key, { mode: event.currentTarget.value as DateRange['mode'] })}>
                    <option value="any">Any time</option>
                    <option value="within">{date.within}</option>
                    <option value="beyond">{date.beyond}</option>
                    <option value="between">Between</option>
                </select>
                {#if range.mode === 'within' || range.mode === 'beyond'}
                    <NumberField bind:value={() => range.amount, (amount) => updateRange(date.key, { amount })} label="Amount" class="w-20" />
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
{/snippet}

<style>
    /* SECTIONS | hairlines between them, the first one sits flush */
    .section + .section {
        margin-top: 1.25rem;
        padding-top: 1.25rem;
        border-top: 1px solid var(--theme-line);
    }

    .row {
        display: grid;
        grid-template-columns: 5.5rem minmax(0, 1fr);
        align-items: center;
        gap: 0.75rem;
    }

    .row:not(:first-child) { margin-top: 0.75rem; }

    .row > span {
        font-size: 0.875rem;
        color: var(--theme-ink-muted);
    }

    .hint {
        margin-top: 0.5rem;
        font-size: 0.8125rem;
        color: var(--theme-ink-faint);
    }

    .reset {
        color: var(--theme-ink-faint);
        transition: color var(--duration-fast) var(--ease-out);
    }

    .reset:hover { color: var(--theme-accent); }

    /* FIELDS */
    .field {
        height: 2.25rem;
        min-width: 0;
        padding-inline: 0.75rem;
        border: 1px solid var(--theme-line);
        border-radius: var(--layout-radius-control);
        background: var(--theme-card);
        color: var(--theme-ink);
        font-size: 0.875rem;
        color-scheme: inherit;
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .field:hover { border-color: var(--theme-line-strong); }
    .field:focus { border-color: var(--theme-accent); outline: none; }

    .search {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        flex: 1 1 12rem;
        height: 2.5rem;
        padding-inline: 0.875rem 0.375rem;
        border: 1px solid var(--theme-line);
        border-radius: 999px;
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .search:hover { border-color: var(--theme-line-strong); }
    .search:focus-within { border-color: var(--theme-accent); }

    .search input {
        flex: 1;
        min-width: 0;
        background: transparent;
        color: var(--theme-ink);
        outline: none;
    }


    /* CHIPS | on takes the accent */
    .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.3125rem 0.75rem;
        border: 1px solid var(--theme-line);
        border-radius: 999px;
        color: var(--theme-ink-muted);
        font-size: 0.875rem;
        white-space: nowrap;
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .chip:hover { border-color: var(--theme-line-strong); color: var(--theme-ink); }
    .chip:active { scale: 0.95; }

    .chip.on {
        border-color: var(--theme-accent);
        background: var(--theme-accent-soft);
        color: var(--theme-accent);
    }

    /* LABEL CHIPS | the card tabs' colour and type, a ring marks the picked ones */
    .label-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        height: 1.625rem;
        padding-inline: 0.625rem;
        border-radius: 0.375rem;
        transition: opacity var(--duration-base) var(--ease-out), box-shadow var(--duration-base) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .label-chip:hover { scale: 1.05; opacity: 1; }
    .label-chip:active { scale: 0.95; }

    .label-chip.exclude { opacity: 0.6; }
    .label-chip.exclude .name { text-decoration: line-through; text-decoration-thickness: 1.5px; }
    .label-chip.dim { opacity: 0.45; }

    /* FLOATING LINKS | small pills of their own above the box */
    .float {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        height: 1.75rem;
        padding-inline: 0.75rem;
        border: 1px solid var(--theme-line);
        border-radius: 999px;
        background: color-mix(in oklab, var(--theme-raised) 85%, transparent);
        backdrop-filter: blur(16px);
        color: var(--theme-ink-muted);
        box-shadow: 0 4px 12px -4px color-mix(in oklab, var(--theme-ink) 18%, transparent);
        transition: color var(--duration-fast) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .float:hover { color: var(--theme-accent); }
    .float:active { scale: 0.95; }

    /* ICON TOGGLES | on takes the accent, a ring marks the archive's both state */
    .icon-toggle {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 999px;
        color: var(--theme-ink-faint);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .icon-toggle:hover { color: var(--theme-ink); background: var(--theme-line); }
    .icon-toggle:active { scale: 0.92; }
    .icon-toggle.on { background: var(--theme-accent); color: var(--theme-on-accent); }
    .icon-toggle.half { color: var(--theme-accent); box-shadow: inset 0 0 0 1.5px var(--theme-accent); }

    .badge {
        display: grid;
        place-items: center;
        min-width: 1rem;
        height: 1rem;
        padding-inline: 0.25rem;
        border-radius: 999px;
        background: var(--theme-accent);
        color: var(--theme-on-accent);
        font-size: 0.625rem;
        line-height: 1;
    }

    /* SWATCHES */
    .swatch {
        transition: scale var(--duration-base) var(--ease-spring);
    }

    .swatch:hover { scale: 1.12; }
    .swatch.on { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
</style>
