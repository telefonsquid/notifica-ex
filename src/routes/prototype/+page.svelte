<script lang="ts">
    import { flushSync } from 'svelte'
    import { prefersReducedMotion } from 'svelte/motion'
    import { Cog, ListFilter, Moon, Plus, Search, Sun, X } from '@lucide/svelte'
    import { cssEasing, duration, rise, sink } from '#lib/motion.ts'
    import { CELL, band } from './paper.ts'
    import { NOTES, type Note as NoteData, type View } from './notes.ts'
    import Composer from './Composer.svelte'
    import Filter from './Filter.svelte'
    import Masonry from './Masonry.svelte'
    import Note from './Note.svelte'
    import Paper from './Paper.svelte'
    import Settings from './Settings.svelte'
    import Squares from './Squares.svelte'

    // STATE
    let notes = $state(structuredClone(NOTES))
    let dark = $state(false)
    let query = $state('')
    let label = $state<string | null>(null)
    let view = $state<View>('notes')
    let archived = $state(false)
    let panel = $state<'search' | 'filter' | 'settings' | 'add' | null>(null)

    const VIEWS: View[] = ['notes', 'reminders']

    let visible = $derived(notes.filter((note) => {
        if(archived ? !note.archived : note.archived) return false
        if(view === 'reminders' && !note.reminder) return false
        if(label && !note.labels.includes(label)) return false
        if(!query) return true
        return JSON.stringify(note).toLowerCase().includes(query.toLowerCase())
    }))

    // ACTIONS
    function toggle(note: NoteData, item: number){
        if(note.kind === 'list') note.items[item].done = !note.items[item].done
    }

    function add(note: NoteData){
        notes.unshift(note)
        panel = null
    }

    function open(name: typeof panel){
        panel = panel === name ? null : name
    }

    // CENTERING | snapped to whole cells, so the notes still sit on the grid lines
    let windowHeight = $state(0)
    let stackHeight = $state(0)
    let top = $derived(Math.max(CELL, Math.floor((windowHeight - stackHeight) / 2 / CELL) * CELL))

    // Jump into place on load and glide on every later change
    let settled = $state(false)

    $effect(() => {
        if(!stackHeight || settled) return
        const frame = requestAnimationFrame(() => settled = true)
        return () => cancelAnimationFrame(frame)
    })

    // Close the open panel on a click anywhere outside the dock
    let dock: HTMLElement | undefined = $state()

    function outside(event: PointerEvent){
        if(panel && !dock?.contains(event.target as Node)) panel = null
    }

    // LIGHTS | the new mode grows as a circle out of the toggle
    async function lights(event: MouseEvent){
        const flip = () => {
            dark = !dark
            flushSync()
        }
        if(!document.startViewTransition || prefersReducedMotion.current) return flip()

        const { clientX: x, clientY: y } = event
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
        const root = document.documentElement

        root.dataset.transition = 'theme'
        const transition = document.startViewTransition(flip)

        try {
            await transition.ready
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: duration('page') * 1.4, easing: cssEasing('emphasized'), pseudoElement: '::view-transition-new(root)' }
            )
            await transition.finished
        } finally {
            delete root.dataset.transition
        }
    }
</script>

<svelte:head>
    <title>notifica-ex · prototype</title>
</svelte:head>

<svelte:window bind:innerHeight={windowHeight} onpointerdown={outside} onkeydown={(event) => { if(event.key === 'Escape') panel = null }} />

<Paper {dark}>
    <main class={['sheet', settled && 'settled']} style:padding-top="{top}px">
        <div class="stack" bind:clientHeight={stackHeight}>
            <!-- DOCK | stays on top while scrolling, panels drop down over the notes -->
            <div class="dock" bind:this={dock}>
                <!-- SWITCH | both halves share one box, the dark block slides to the open one -->
                <div class="switch" style:--at={VIEWS.indexOf(view)}>
                    {#each VIEWS as name (name)}
                        <button aria-pressed={view === name} onclick={() => view = name}>{name}</button>
                    {/each}
                </div>

                <div class="buttons">
                    <button class="button" aria-label={dark ? 'Light mode' : 'Dark mode'} onclick={lights}>
                        {#if dark}<Sun size={20} />{:else}<Moon size={20} />{/if}
                    </button>

                    <button class={['button', (archived || label) && 'set']} aria-label="Filter" aria-expanded={panel === 'filter'} onclick={() => open('filter')}>
                        <ListFilter size={20} />
                    </button>

                    <button class={['button', query && 'set']} aria-label="Search" aria-expanded={panel === 'search'} onclick={() => open('search')}>
                        <Search size={20} />
                    </button>

                    <button class="button" aria-label="Settings" aria-expanded={panel === 'settings'} onclick={() => open('settings')}>
                        <Cog size={20} />
                    </button>

                    <button class="button primary" aria-label="New note" aria-expanded={panel === 'add'} onclick={() => open('add')}>
                        <Plus size={22} />
                    </button>
                </div>

                {#if panel}
                    <div class="panel" in:rise={{ y: -8, blur: 0, duration: 'base' }} out:sink={{ y: -6, blur: 0 }}>
                        {#if panel === 'search'}
                            <label class="search">
                                <Search size={14} strokeWidth={2.2} />
                                <input placeholder="search" bind:value={query} {@attach (node) => node.focus()} />
                                {#if query}
                                    <button aria-label="Clear search" onclick={() => query = ''}><X size={14} /></button>
                                {/if}
                            </label>
                        {:else if panel === 'filter'}
                            <Filter bind:archived bind:label />
                        {:else if panel === 'settings'}
                            <Settings />
                        {:else}
                            <Composer onadd={add} />
                        {/if}
                    </div>
                {/if}
            </div>

            <!-- NOTES | framed by a band of squares above and below -->
            <Masonry items={visible}>
                {#snippet tile(note)}
                    <Note {note} ontoggle={(item) => toggle(note, item)} />
                {/snippet}

                {#snippet frame(side, cells)}
                    <Squares pattern={band(side === 'above' ? 41 : 42, cells + 4, 4, side === 'above' ? 'up' : 'down')} seed={side === 'above' ? 41 : 42} class="frame" />
                {/snippet}
            </Masonry>

            {#if !visible.length}
                <p class="type-meta empty">nothing here</p>
            {/if}
        </div>
    </main>
</Paper>

<style>
    .sheet {
        position: relative;
        z-index: 1;
        min-height: 100dvh;
        padding: var(--cell) var(--cell) calc(var(--cell) * 2);
        font-size: 14px;
        line-height: var(--cell);
    }

    .settled {
        transition: padding-top var(--duration-slow) var(--ease-out);
    }

    /* Wider than the notes, so the band frays out past both sides */
    .sheet :global(.frame) {
        position: relative;
        left: 50%;
        translate: -50% 0;
    }

    .empty {
        text-align: center;
        color: var(--ink-faint);
    }

    /* DOCK | buttons and margin add up to whole cells, so the notes below still start on a grid line */
    .dock {
        --size: calc(var(--cell) * 2.5);

        position: sticky;
        top: var(--cell);
        z-index: 10;
        display: flex;
        gap: var(--cell);
        width: fit-content;
        margin: 0 auto calc(var(--cell) * 1.5);
    }

    /* Phones stack the switch above the buttons */
    @media (width < 520px) {
        .dock {
            flex-direction: column;
            gap: calc(var(--cell) / 2);
            align-items: center;
        }
    }

    .buttons {
        display: flex;
        gap: 8px;
    }

    /* SWITCH */
    .switch {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 1fr;
        height: var(--size);
        padding: 4px;
        border-radius: 3px;
        background: var(--card);
        box-shadow: 0 0 0 1px var(--rule), var(--lift);
    }

    .switch::before {
        content: '';
        position: absolute;
        inset: 4px auto 4px 4px;
        width: calc(50% - 4px);
        border-radius: 2px;
        background: var(--graphite);
        translate: calc(var(--at) * 100%) 0;
        transition: translate var(--duration-base) var(--ease-spring);
    }

    .switch button {
        position: relative;
        padding-inline: var(--cell);
        color: var(--ink-soft);
        cursor: pointer;
        transition: color var(--duration-base) var(--ease-out);
    }

    .switch button:hover {
        color: var(--ink);
    }

    .switch [aria-pressed='true'], .switch [aria-pressed='true']:hover {
        color: var(--sheet);
    }

    .button {
        position: relative;
        display: grid;
        place-items: center;
        width: var(--size);
        height: var(--size);
        border-radius: 3px;
        background: var(--card);
        box-shadow: 0 0 0 1px var(--rule), var(--lift);
        color: var(--ink-soft);
        cursor: pointer;
        transition: color var(--duration-fast) var(--ease-out), translate var(--duration-base) var(--ease-spring), background-color var(--duration-fast) var(--ease-out);
    }

    .button:hover, .button[aria-expanded='true'] {
        translate: 0 -2px;
        color: var(--ink);
    }

    .primary, .primary:hover {
        background: var(--graphite);
        color: var(--sheet);
    }

    .primary[aria-expanded='true'] :global(svg) {
        rotate: 45deg;
    }

    .primary :global(svg) {
        transition: rotate var(--duration-base) var(--ease-spring);
    }

    /* A small accent square marks a button whose filter is in use */
    .set::after {
        content: '';
        position: absolute;
        top: 5px;
        right: 5px;
        width: 5px;
        height: 5px;
        background: var(--accent);
    }

    .panel {
        position: absolute;
        top: calc(100% + var(--cell) / 2);
        left: 50%;
        translate: -50% 0;
        width: min(calc(var(--cell) * 21), calc(100vw - 32px));
        border-radius: 3px;
        background: var(--card);
        box-shadow: 0 0 0 1px var(--rule), var(--lift);
        transform-origin: top center;
    }

    /* SEARCH */
    .search {
        display: flex;
        gap: calc(var(--cell) / 2);
        align-items: center;
        height: calc(var(--cell) * 2);
        padding-inline: var(--cell);
        color: var(--ink-faint);
    }

    .search input {
        flex: 1;
        min-width: 0;
        background: none;
        outline: none;
        color: var(--ink);
    }

    .search input::placeholder {
        color: var(--ink-faint);
    }

    .search button {
        display: grid;
        cursor: pointer;
    }
</style>
