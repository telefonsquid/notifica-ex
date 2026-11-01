<script lang="ts">
    import { now } from '#lib/clock.svelte.ts';
    import DoneButton from '#lib/components/DoneButton.svelte';
    import { cssEasing, duration, easing, emerge, rise, stagger, unfold } from '#lib/motion.ts';
    import { dayKey, formatDay, formatTime } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { onCollectionChange } from '#lib/realtime.ts';
    import type { Occurrence } from '#lib/schemas.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import { history, HISTORY_PAGE } from '#lib/singletons/reminder_history.svelte.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Bell, Check, CheckCheck, MessageSquarePlus, MessageSquareText, Undo2, X } from '@lucide/svelte';
    import { Dialog } from 'bits-ui';
    import type { TransitionConfig } from 'svelte/transition';
    import { fade } from 'svelte/transition';
    import { checkOffHistory, getHistory, setOccurrenceComment, setOccurrenceDone } from '../../routes/api/reminders.remote';

    let args = $derived({ note: history.note.id, limit: history.limit })
    let list = $state<HTMLElement>()

    // Shown right away while the server catches up, keyed by occurrence
    let checks = $state<Record<string, string>>({})
    let comments = $state<Record<string, string>>({})
    let fresh = $state<string[]>([])           // checked while the sheet is open, their tick draws itself

    let editing = $state<string | null>(null)
    let draft = $state('')

    // A notification button or another tab ticks one off meanwhile
    $effect(() => {
        if(!history.open) return
        const current = args
        return onCollectionChange('occurrences', () => getHistory(current).refresh())
    })

    const doneOf = (occurrence: Occurrence) => checks[occurrence.id] ?? occurrence.done
    const commentOf = (occurrence: Occurrence) => comments[occurrence.id] ?? occurrence.comment

    // The server count, moved by whatever is still on its way
    function openCount(page: { items: Occurrence[], open: number }){
        return page.items.reduce((open, occurrence) => {
            if(!(occurrence.id in checks)) return open
            return open + (occurrence.done ? 0 : -1) + (checks[occurrence.id] ? 0 : 1)
        }, page.open)
    }



    // CHECKING ============================================================
    async function toggle(occurrence: Occurrence){
        const done = !doneOf(occurrence)
        mark(occurrence.id, done)

        await safeAction(setOccurrenceDone({ id: occurrence.id, done }))
        await getHistory(args).refresh() // The server can't refresh it, it doesn't know how far the list is shown
        delete checks[occurrence.id]
    }

    // Washes down the list one row after another
    async function checkAll(items: Occurrence[]){
        const open = items.filter((occurrence) => occurrence.task && !doneOf(occurrence))
        open.forEach((occurrence, index) => mark(occurrence.id, true, stagger(index, 45, 12)))

        await safeAction(checkOffHistory({ note: history.note.id }))
        await getHistory(args).refresh()
        open.forEach((occurrence) => delete checks[occurrence.id])
    }

    function mark(id: string, done: boolean, delay = 0){
        checks[id] = done ? new Date().toISOString() : ''
        if(done) fresh.push(id)
        else fresh = fresh.filter((other) => other !== id)

        // A tint sweeps out of the button across the row, stronger for a check than for an undo
        const wash = list?.querySelector<HTMLElement>(`[data-id="${id}"] .wash`)
        wash?.animate([
            { clipPath: 'inset(0 0 0 100%)', opacity: 1 },
            { clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0.4 },
            { clipPath: 'inset(0 0 0 0)', opacity: 0 },
        ], { duration: duration('slow') * (done ? 1.8 : 1.2), delay, easing: cssEasing('out') })
        wash?.style.setProperty('--wash', done ? 'var(--theme-accent)' : 'var(--theme-ink-faint)')
    }



    // COMMENTS ============================================================
    function edit(occurrence: Occurrence){
        draft = commentOf(occurrence)
        editing = occurrence.id
    }

    async function save(occurrence: Occurrence){
        if(editing !== occurrence.id) return // Escape got there first
        editing = null

        const comment = draft.trim()
        if(comment === commentOf(occurrence)) return
        comments[occurrence.id] = comment

        await safeAction(setOccurrenceComment({ id: occurrence.id, comment }))
        await getHistory(args).refresh()
        delete comments[occurrence.id]
    }



    // HELPERS ============================================================
    // Runs of rows on the same calendar day, in the order they come
    function byDay(items: Occurrence[]){
        const days: { key: string, label: string, items: Occurrence[] }[] = []
        for(const occurrence of items){
            const key = dayKey(occurrence.at, occurrence.timezone)
            if(days.at(-1)?.key !== key) days.push({ key, label: formatDay(occurrence.at, occurrence.timezone, now()), items: [] })
            days.at(-1)?.items.push(occurrence)
        }
        return days
    }

    // The checked time only names its day when that differs from the row's
    function checkedAt(occurrence: Occurrence){
        const done = doneOf(occurrence)
        const time = formatTime(done, occurrence.timezone)
        if(dayKey(done, occurrence.timezone) === dayKey(occurrence.at, occurrence.timezone)) return time
        return `${formatDay(done, occurrence.timezone, now())} ${time}`
    }

    // Rows past the first page come in without waiting for the ones above
    function enter(node: Element, { index = 0 } = {}){
        return rise(node, { delay: 120 + stagger(index % HISTORY_PAGE), y: 4, blur: 2, duration: 'base' })
    }

    // The pill folds into its tick on a check and blooms back on an undo
    function pill(_node: Element, { leaving = false } = {}): TransitionConfig {
        return {
            duration: duration(leaving ? 'base' : 'slow'),
            easing: easing(leaving ? 'in' : 'spring'),
            css: (t, u) => `
                transform-origin: right center;
                opacity: ${Math.min(1, t * 1.5)};
                transform: scale(${0.55 + 0.45 * t});
                filter: blur(${u * 4}px);
            `
        }
    }

    // The checked time slides in from where the pill was
    function trail(_node: Element, { leaving = false } = {}): TransitionConfig {
        return {
            delay: leaving ? 0 : duration('fast'),
            duration: duration(leaving ? 'fast' : 'slow'),
            easing: easing(leaving ? 'in' : 'out'),
            css: (t, u) => `
                opacity: ${t};
                transform: translateX(${u * 12}px);
                filter: blur(${u * 3}px);
            `
        }
    }

    function focus(node: HTMLInputElement){
        node.focus()
        node.select()
    }
</script>

<Dialog.Root bind:open={history.open} onOpenChange={() => { editing = null; fresh = [] }}>
    <Dialog.Portal>
        <Dialog.Overlay forceMount>
            {#snippet child({ props, open })}
                {#if open}
                    <div {...props} class="scrim fixed inset-0 z-[72]" transition:fade={{ duration: duration('base'), easing: easing('out') }}></div>
                {/if}
            {/snippet}
        </Dialog.Overlay>
        <Dialog.Content
            forceMount
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => { event.preventDefault(); history.anchor?.focus({ preventScroll: true }) }}
            onEscapeKeydown={(event) => { if(editing){ event.preventDefault(); editing = null } }}
        >
            {#snippet child({ props, open: shown })}
                {#if shown}
                    <div {...props} class="fixed inset-0 z-[73] grid place-items-center p-gutter outline-none" onclick={(event) => { if(event.target === event.currentTarget) history.open = false }}>
                        <!-- SHEET | dressed like the note it belongs to -->
                        <div class="note-surface flex max-h-[min(36rem,100%)] w-full max-w-sm flex-col overflow-hidden rounded-card border border-line-strong text-ink shadow-2xl" data-note={history.note.color || undefined} in:emerge={{ anchor: history.anchor }} out:emerge={{ anchor: history.anchor, leaving: true }}>
                            <!-- HEADER -->
                            <div class="flex items-start gap-2 p-card pb-3">
                                <div class="grid min-w-0 flex-1 gap-0.5">
                                    <Dialog.Title class={['type-title truncate text-lg leading-snug', !history.note.title && 'text-ink-faint']}>{history.note.title || 'Untitled'}</Dialog.Title>
                                    <Dialog.Description class="type-meta text-ink-faint">History</Dialog.Description>
                                </div>
                                <Dialog.Close class="icon-button -mt-1 -mr-2" aria-label="Close"><X class="size-4" /></Dialog.Close>
                            </div>

                            <!-- LIST | newest on top, one line per time it went off -->
                            <div bind:this={list} class="band min-h-0 flex-1 overflow-y-auto pb-2">
                                <svelte:boundary>
                                    {@const page = await getHistory(args)}
                                    {@const open = openCount(page)}

                                    <!-- CHECK ALL | sits in the column of the Done buttons below -->
                                    {#if open > 1}
                                        <div class="flex h-11 items-center gap-3 px-card" in:unfold out:unfold>
                                            <span class="type-meta flex-1 text-accent">{open} open</span>
                                            <DoneButton icon={CheckCheck} label="Check all" onclick={() => checkAll(page.items)} />
                                        </div>
                                    {/if}

                                    {#if !page.items.length}
                                        <p class="px-card py-8 text-center text-sm text-ink-faint" in:enter>Nothing went off yet</p>
                                    {:else}
                                        {#each byDay(page.items) as day (day.key)}
                                            <section>
                                                <h3 class="type-meta px-card pt-3 pb-1 text-ink-faint">{day.label}</h3>
                                                <ol>
                                                    {#each day.items as occurrence (occurrence.id)}
                                                        {@const index = page.items.indexOf(occurrence)}
                                                        {@const done = doneOf(occurrence)}
                                                        {@const comment = commentOf(occurrence)}
                                                        <li class={['row relative', occurrence.task && !done ? 'text-ink' : 'text-ink-muted']} data-id={occurrence.id} in:enter={{ index }}>
                                                            <span class="wash pointer-events-none absolute inset-0" aria-hidden="true"></span>

                                                            <div class="relative flex h-9 items-center gap-3 px-card">
                                                                <time class="time flex-1 text-sm" datetime={occurrence.at}>{formatTime(occurrence.at, occurrence.timezone)}</time>

                                                                <!-- One cell, so the pill and the checked time swap places without the row moving -->
                                                                <div class="grid items-center justify-items-end">
                                                                    {#if !occurrence.task}
                                                                        <Bell class="size-3.5 text-ink-faint" aria-label="Sent without a Done button" />
                                                                    {:else if done}
                                                                        <div class="slot -mr-2 flex items-center" in:trail out:trail={{ leaving: true }}>
                                                                            <span class="type-meta mr-1 flex items-center gap-1 text-ink-faint" aria-label={`Checked ${checkedAt(occurrence)}`}>
                                                                                <Check class={['size-3 text-accent', fresh.includes(occurrence.id) && 'draw']} />{checkedAt(occurrence)}
                                                                            </span>
                                                                            <button class={['icon-button p-1.5', comment && 'text-ink-muted']} aria-label={comment ? 'Edit comment' : 'Add comment'} onclick={() => edit(occurrence)} {@attach tip(comment ? 'Edit comment' : 'Comment')}>
                                                                                {#if comment}<MessageSquareText class="size-3.5" />{:else}<MessageSquarePlus class="size-3.5" />{/if}
                                                                            </button>
                                                                            <button class="icon-button p-1.5" aria-label="Undo" onclick={() => toggle(occurrence)} {@attach tip('Undo')}>
                                                                                <Undo2 class="size-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    {:else}
                                                                        <div class="slot" in:pill out:pill={{ leaving: true }}>
                                                                            <DoneButton onclick={() => toggle(occurrence)} />
                                                                        </div>
                                                                    {/if}
                                                                </div>
                                                            </div>

                                                            <!-- COMMENT | written only on request, a click on it edits again -->
                                                            {#if editing === occurrence.id}
                                                                <div class="relative px-card pb-2.5" in:unfold out:unfold>
                                                                    <form
                                                                        class="comment-field"
                                                                        onsubmit={(event) => { event.preventDefault(); save(occurrence) }}
                                                                        onfocusout={(event) => { if(!event.currentTarget.contains(event.relatedTarget as Node | null)) save(occurrence) }}
                                                                    >
                                                                        <input
                                                                            bind:value={draft}
                                                                            maxlength={LIMITS.OCCURRENCE_COMMENT}
                                                                            placeholder="Add a comment"
                                                                            aria-label="Comment"
                                                                            {@attach focus}
                                                                        />
                                                                        <button type="submit" class="ok" aria-label="Save comment"><Check class="size-3.5" strokeWidth={2.5} /></button>
                                                                    </form>
                                                                </div>
                                                            {:else if comment}
                                                                <div class="relative px-card pb-2.5" in:unfold out:unfold>
                                                                    <button class="comment" onclick={() => edit(occurrence)}>{comment}</button>
                                                                </div>
                                                            {/if}
                                                        </li>
                                                    {/each}
                                                </ol>
                                            </section>
                                        {/each}
                                        {#if page.items.length < page.total}
                                            <div class="flex justify-center pt-2">
                                                <button class="type-meta motion-interactive rounded-full px-3 py-1.5 text-ink-faint hover:bg-line hover:text-ink" onclick={() => history.limit += HISTORY_PAGE}>Show older</button>
                                            </div>
                                        {/if}
                                    {/if}

                                    {#snippet pending()}
                                        <p class="p-card py-8 text-center text-sm text-ink-faint">Loading…</p>
                                    {/snippet}
                                    {#snippet failed()}
                                        <p class="p-card py-8 text-center text-sm text-ink-faint">Could not load the history</p>
                                    {/snippet}
                                </svelte:boundary>
                            </div>
                        </div>
                    </div>
                {/if}
            {/snippet}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    .scrim {
        background: rgb(0 0 0 / 0.4);
        backdrop-filter: blur(3px);
    }

    /* The same darker strip the reminders sit on in the card */
    .band {
        background-color: var(--theme-note-shade);
    }

    .row {
        transition: color var(--duration-base) var(--ease-out);
    }

    .wash {
        opacity: 0;
        background: linear-gradient(to left, color-mix(in oklab, var(--wash, var(--theme-accent)) 22%, transparent), color-mix(in oklab, var(--wash, var(--theme-accent)) 6%, transparent));
    }

    .time {
        font-variant-numeric: tabular-nums;
    }

    .slot {
        grid-area: 1 / 1;
    }

    /* Sits on the shaded band like a small card of its own */
    .comment-field {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        height: 2.25rem;
        padding-inline: 0.25rem;
        border: 1px solid var(--theme-line-strong);
        border-radius: var(--layout-radius-control);
        background: color-mix(in oklab, var(--theme-raised) 70%, transparent);
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .comment-field:focus-within {
        border-color: var(--theme-accent);
    }

    /* Inline padding keeps the caret clear of the field's edge */
    .comment-field input {
        flex: 1;
        min-width: 0;
        padding-inline: 0.5rem;
        background: transparent;
        color: var(--theme-ink);
        font-size: 0.875rem;
        outline: none;
    }

    .comment-field input::placeholder {
        color: var(--theme-ink-faint);
    }

    .ok {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: calc(var(--layout-radius-control) - 0.25rem);
        background: var(--theme-accent);
        color: var(--theme-on-accent);
        transition: filter var(--duration-fast) var(--ease-out), scale var(--duration-fast) var(--ease-out);
    }

    .ok:hover { filter: brightness(1.08); }
    .ok:active { scale: 0.92; }

    /* A quote line, its text where the field's text sits */
    .comment {
        display: block;
        width: 100%;
        padding: 0.125rem 0 0.125rem calc(0.75rem - 2px);
        border-left: 2px solid var(--theme-line-strong);
        margin-left: 1px;
        color: var(--theme-ink-muted);
        font-size: 0.875rem;
        text-align: left;
        overflow-wrap: anywhere;
        transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
    }

    .comment:hover {
        color: var(--theme-ink);
        border-color: var(--theme-accent);
    }

    /* The tick of a fresh check draws itself once the pill is gone */
    @media (prefers-reduced-motion: no-preference) {
        .draw :global(path) {
            stroke-dasharray: 24;
            stroke-dashoffset: 24;
            animation: draw var(--duration-slow) var(--ease-out) var(--duration-base) forwards;
        }
    }

    @keyframes draw {
        to { stroke-dashoffset: 0; }
    }
</style>
