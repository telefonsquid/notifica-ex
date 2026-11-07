<script lang="ts">
    import { afterNavigate, goto, onNavigate } from '$app/navigation'
    import { resolve } from '$app/paths'
    import { page } from '$app/state'
    import { CARD_WINDOW_FROM, CARDS_ALWAYS_SHOWN, CardWindow } from '#lib/card_window.svelte.ts'
    import NoteView, { editor } from '#lib/components/Note.svelte'
    import NoteMenu from '#lib/components/NoteMenu.svelte'
    import NotesEmpty from '#lib/components/NotesEmpty.svelte'
    import NoteToolbar from '#lib/components/NoteToolbar.svelte'
    import { toggleTask } from '#lib/markdown.ts'
    import { masonry, pack } from '#lib/masonry.ts'
    import { cssEasing, duration, easing, glide, measure, offscreen, rise, stagger } from '#lib/motion.ts'
    import { hiddenNotes, removeNotes } from '#lib/deletions.ts'
    import { takeShare, type SharedNote } from '#lib/android.ts'
    import { keepEvents, kept } from '#lib/note_list.ts'
    import { notify } from '#lib/notifications.svelte.ts'
    import { safeAction } from '#lib/pocketbase.ts'
    import { onCollectionChange } from '#lib/realtime.ts'
    import { Selection, typing } from '#lib/selection.svelte.ts'
    import type { Note, Reminder, ViewFilter, ViewSort } from '#lib/schemas.ts'
    import { defaultSort, emptyFilter, groupReminders, matchesView, noteDefaults, noteText, positionBetween, sortNotes, wordsOf } from '#lib/views.ts'
    import { X } from '@lucide/svelte'
    import { ContextMenu } from 'bits-ui'
    import { flushSync, onMount, tick, untrack } from 'svelte'
    import type { TransitionConfig } from 'svelte/transition'
    import { getLabels } from '../../api/labels.remote'
    import { getNotes, moveNote, updateNote } from '../../api/notes.remote'
    import { getReminders, setReminderDone } from '../../api/reminders.remote'
    import { getPeople } from '../../api/users.remote'
    import { getViews } from '../../api/views.remote';

    // DATA | saves and realtime events merge single notes into the list, the rest refresh
    let [stored, labels, reminders, views, people] = $derived(await Promise.all([getNotes(), getLabels(), getReminders(), getViews(), getPeople()]))
    let notes = $derived(hiddenNotes.size ? stored.filter((note) => !hiddenNotes.has(note.id)) : stored)
    let me = $derived(page.data.user?.id ?? '')

    let remindersByNote = $derived(groupReminders(reminders))

    $effect(() => onCollectionChange<Note>('notes', keepEvents, shown))
    $effect(() => onCollectionChange('labels', () => getLabels().refresh()))
    $effect(() => onCollectionChange('reminders', () => getReminders().refresh()));

    // Own saves echo back through realtime, a second copy of every note would be wasted
    function shown({ action, record }: { action: string; record: Note }): boolean {
        const note = notes.find((item) => item.id === record.id)
        return action === 'delete' ? !note : note?.updated === record.updated
    }

    // VIEW | the first one lives at the root, a deleted one leaves an empty page behind
    let view = $derived(page.params.view ? views.find((item) => item.id === page.params.view) : views[0]);

    // TWEAKS | a scratch copy of the view's filter until it gets saved, dropped on every navigation
    let draft = $state<{ filter: ViewFilter; sort: ViewSort } | null>(null)
    let search = $state('')

    afterNavigate(({ type }) => {
        draft = null
        selected.clear()
        if (type === 'enter') return
        shut()
    })

    let filter = $derived(draft?.filter ?? view?.filter ?? emptyFilter())
    let sort = $derived(draft?.sort ?? view?.sort ?? defaultSort());

    // EDITOR STATE | a key per opening, so every note starts with a fresh draft
    let editing = $state<{ key: number; id: string | null; fresh: boolean; focus?: string } | null>(null)
    let frozen = $state.raw<string[] | null>(null)
    let opened = 0;

    // The open note stays even once it stops matching, a new one keeps its blank card up front
    let visible = $derived.by(() => {
        if (!view) return []
        const context = { reminders: remindersByNote, now: new Date() }
        const words = wordsOf(search)
        const shown = notes.filter((note) => {
            if (note.id === editing?.id) return !editing.fresh
            if (!matchesView(note, filter, context)) return false
            const text = words.length ? noteText(note) : ''
            return words.every((word) => text.includes(word))
        })
        const sorted = sortNotes(shown, sort, remindersByNote)
        if (!frozen) return sorted;

        // Order holds still while a card is open, every autosave would reshuffle it otherwise
        const rank = new Map(frozen.map((id, index) => [id, index]))
        return sorted.toSorted((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1))
    });

    // LONG LISTS | cards far off screen wait as empty boxes
    const cards = new CardWindow()
    let windowed = $derived(visible.length > CARD_WINDOW_FROM)

    // EDITING | one card at a time opens in place, a new note grows out of the create button
    let closing = $state(false)
    let freshNote = $state<{ flush: () => Promise<string | null> }>()
    let createButton = $state<HTMLElement>()
    let busy: Promise<unknown> = Promise.resolve()
    let origin: DOMRect | null = null
    let handover: string | null = null
    let returning = false
    let incoming = $state<SharedNote | null>(null)

    function edit(note: Note | null, focus?: string, shared: SharedNote | null = null) {
        busy = busy.then(async () => {
            incoming = shared
            if (note && editing?.id === note.id) return
            await fold()
            await editor.load(); // One glide only, a late editor would move the grid a second time | touch screens never preload it
            if (!note) origin = createButton?.getBoundingClientRect() ?? null
            frozen = visible.map((item) => item.id)
            snapshot()
            editing = { key: ++opened, id: note?.id ?? null, fresh: !note, focus }
            closing = false
            await tick()
            reveal(document.querySelector('.note.open')?.closest<HTMLElement>('[data-flip]'))
        })
    }

    // SHARED FROM ANOTHER APP | waits in the Android app until this page is up
    function takeShared() {
        const shared = takeShare()
        if (!shared) return
        if (shared.unread) notify('Some of the shared images could not be read.', { type: 'error' })
        edit(null, undefined, shared)
    }

    onMount(() => {
        takeShared()
        window.addEventListener('notifica-android', takeShared)
        return () => window.removeEventListener('notifica-android', takeShared)
    })

    // Brings the whole open note into view, its top first when it is taller than the screen
    // The cell already has the size and spot the glide ends with
    function reveal(cell: HTMLElement | null | undefined) {
        if (!cell) return
        const style = getComputedStyle(cell)
        const room = innerHeight - parseFloat(style.scrollMarginTop) - parseFloat(style.scrollMarginBottom)
        cell.scrollIntoView({ block: cell.offsetHeight > room ? 'start' : 'nearest', behavior: 'smooth' })
    }

    function closeEditor() {
        busy = busy.then(async () => {
            if (!editing) return
            await fold()
            snapshot()
            shut()
        })
    }

    function shut() {
        editing = null
        frozen = null
        closing = false
    }

    // The open note's controls fade first | a new note then hands over to its card, or shrinks back into the button when empty
    async function fold() {
        handover = null
        returning = false
        if (!editing) return

        closing = true
        await new Promise((done) => setTimeout(done, duration('fast')))
        if (!editing?.fresh) return

        const id = await freshNote?.flush()
        handover = id ?? null
        returning = !id
    }

    // RELAYOUT | every change to the grid glides the cells from where they were, the editor arriving late too
    let grid = $state<HTMLElement>()
    let before: Map<string, DOMRect> | undefined;

    // Rects before the next change, the first one wins until its glide ran | the button joins it even then
    function snapshot() {
        if (!grid) return
        before ??= measure(grid)
        if (origin) before.set('new', origin)
        origin = null
    }

    // What moves the grid
    const layoutInputs = () => [visible, editing?.id, editing?.key, editor.loaded];

    // Opening and closing take the snapshot themselves, a card may change before this runs then
    // Untracked, the grid binding alone would leave a snapshot that no glide ever takes
    $effect.pre(() => {
        layoutInputs()
        untrack(snapshot)
    });

    // Another view swaps the cells before the effect above runs, so cards on both glide from here
    onNavigate(({ to }) => {
        if (to?.route.id === page.route.id) snapshot()
    });

    // Waits for the effects of the cells too, the editor fills in its text only then
    // Not tick(), which waits a frame in async mode and shows the new layout unanimated meanwhile
    let pending = false

    $effect(() => {
        layoutInputs()
        if (!before || pending) return
        pending = true
        queueMicrotask(() => {
            flushSync()
            const from = before
            before = undefined
            pending = false
            if (grid && from) glide(grid, from, () => pack(grid!))
        })
    })

    const UNSEEN_FROM = 40; // Cards this far down the list skip their entrance, nobody sees it

    // New cards rise into place, the card taking over from a new note glides there instead
    function enter(node: Element, { id, index }: { id: string; index: number }): TransitionConfig {
        return id === handover || index >= UNSEEN_FROM ? {} : rise(node, { delay: stagger(index) })
    }

    // Leaving cards fade where they stood, out of the flow so the rest glide into their place
    function leave(node: HTMLElement, id: string): TransitionConfig {
        const from = before?.get(id) ?? node.getBoundingClientRect()
        delete node.dataset.flip
        if (offscreen(from)) {
            node.style.display = 'none'
            return { duration: 1 }; // An empty transition ends at once, Svelte then never removes the card while others still fade
        }

        const frame = grid?.getBoundingClientRect()
        if (frame) Object.assign(node.style, { position: 'absolute', left: `${from.left - frame.left}px`, top: `${from.top - frame.top}px`, width: `${from.width}px` })

        return {
            duration: duration('fast'),
            easing: easing('out'),
            css: (t) => `opacity: ${t}; scale: ${0.97 + 0.03 * t};`
        }
    }

    // A saved new note makes room for its card at once, an empty one shrinks back into the button
    function retreat(node: HTMLElement): TransitionConfig {
        delete node.dataset.flip
        const button = createButton
        const body = node.querySelector<HTMLElement>('[data-flip-body]')
        const card = body?.querySelector<HTMLElement>('.card')
        if (!returning || !button || !grid || !body || !card) {
            node.style.display = 'none'
            return {}
        }

        // Starts where it is seen, an open glide still running included
        const from = body.getBoundingClientRect();
        [node, body].forEach((part) => part.getAnimations().forEach((animation) => animation.cancel()))
        const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius);

        // Out of the grid flow so the other cards can glide into its place meanwhile
        Object.assign(node.style, { position: 'absolute', height: '', zIndex: '1' })
        body.dataset.resizing = '';

        // Grid and button both move while the others settle, so both are read every frame
        const place = (t: number, u: number) => {
            const target = button.getBoundingClientRect()
            const frame = grid!.getBoundingClientRect()
            node.style.left = `${target.left + t * (from.left - target.left) - frame.left}px`
            node.style.top = `${target.top + t * (from.top - target.top) - frame.top}px`
            node.style.width = body.style.width = `${target.width + t * (from.width - target.width)}px`; // A wider cell would overhang the page near the button
            body.style.height = `${target.height + t * (from.height - target.height)}px`
            card.style.borderRadius = `${radius + u * (target.height / 2 - radius)}px`
        }
        place(1, 0)

        return {
            duration: duration('slow'),
            easing: easing('emphasized'),
            css: (t) => `opacity: ${Math.min(1, t * 3)};`,
            tick: place
        }
    }

    // Notification taps land on /?note=id | the address drops it first, that navigation would close the note again
    $effect(() => {
        const id = page.url.searchParams.get('note')
        if (!id) return
        const note = untrack(() => notes.find((item) => item.id === id))
        goto(resolve('/(app)/[[view]]', { view: page.params.view }), { shallow: true, replace: true }).then(() => {
            if (note) edit(note)
        })
    });

    // The open note got deleted or unshared elsewhere, its card is gone so the editor goes too
    $effect(() => {
        if (!editing?.id || editing.fresh || notes.some((note) => note.id === editing?.id)) return
        untrack(shut)
    });

    // SELECTION | a card click toggles while anything is selected, notes that vanished drop out on their own
    const selected = new Selection()
    let selection = $derived(notes.filter((note) => selected.has(note.id)));

    // Ctrl picks a single note, shift a range | an open card keeps its clicks
    function modifiedClick(event: MouseEvent, id: string) {
        if (editing?.id === id || (!event.shiftKey && !event.ctrlKey && !event.metaKey)) return
        event.stopPropagation()
        event.preventDefault()
        if (event.shiftKey) selected.toggleRange(id, visible.map((note) => note.id))
        else selected.toggle(id)
    }

    // A shift press would otherwise mark the text between two cards
    function holdTextSelection(event: MouseEvent, id: string) {
        if (event.shiftKey && editing?.id !== id) event.preventDefault()
    }

    // A right click on a selected card acts on the whole selection
    function targetsOf(note: Note): Note[] {
        return selected.has(note.id) ? selection : [note]
    }

    function removeSelection() {
        removeNotes(selection, me)
        selected.clear()
    }

    function onKey(event: KeyboardEvent) {
        const menuOpen = event.defaultPrevented || document.querySelector('[role=menu]'); // Escape closes the menu first, the selection stays
        if (event.key === 'Escape' && selection.length && !editing && !menuOpen) {
            event.preventDefault()
            selected.clear()
        }
        else if (event.key === 'Delete' && selection.length && !editing && !menuOpen && !typing(event)) removeSelection()
        else if (event.key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !editing && !selection.length && !menuOpen && !typing(event) && !document.querySelector('[data-dialog-content]')) {
            event.preventDefault()
            edit(null)
        }
    }

    // QUICK ACTIONS ON CARDS
    function tickTask(note: Note, index: number) {
        safeAction(kept(updateNote({ id: note.id, body: toggleTask(note.body, index) })))
    }

    function markDone(reminder: Reminder) {
        safeAction(setReminderDone(reminder.id))
    }

    // DRAG | the mouse moves cards in a manual sort, each card it passes gives up its place
    // Past this many cards the grid holds still until the drop, a reorder on every pass sends them all flying
    const LIVE_DRAG_LIMIT = 10

    let drag: { id: string; cell: HTMLElement; start: { x: number; y: number }; grab: { x: number; y: number }; from: string[] | null; over: string | null; target: HTMLElement | null } | null = null
    let pointer = { x: 0, y: 0 }
    let dropped = false

    function grab(event: PointerEvent, id: string) {
        if (event.pointerType === 'touch' || event.button !== 0 || sort.by !== 'manual' || editing || selection.length) return
        if (notes.find((note) => note.id === id)?.owner !== me) return; // The order of a shared note is its owner's
        const cell = event.currentTarget as HTMLElement
        const rect = cell.getBoundingClientRect()
        drag = { id, cell, start: { x: event.clientX, y: event.clientY }, grab: { x: event.clientX - rect.left, y: event.clientY - rect.top }, from: null, over: null, target: null }
    }

    function dragMove(event: PointerEvent) {
        if (!drag) return
        pointer = { x: event.clientX, y: event.clientY };

        // A few pixels of slack keep a plain click a click
        if (!drag.from) {
            if (Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) < 6) return
            drag.from = visible.map((note) => note.id)
            frozen = drag.from
            drag.cell.dataset.dragging = ''
        }
        follow();

        // The card under the pointer, the dragged one itself left out
        const over = document.elementsFromPoint(pointer.x, pointer.y).map((node) => node.closest<HTMLElement>('[data-flip]')).find((cell) => cell && cell !== drag?.cell)?.dataset.flip ?? null
        if (over === drag.over) return
        drag.over = over
        if (!over || !frozen) return;

        // Pinned notes stay among themselves while they sort first
        const moving = notes.find((note) => note.id === drag?.id)
        const passed = notes.find((note) => note.id === over)
        if (!moving || !passed || (sort.pinnedFirst && moving.pinned !== passed.pinned)) return;

        // Many cards only mark where the drop lands
        if (frozen.length > LIVE_DRAG_LIMIT) {
            if (drag.target) delete drag.target.dataset.dropTarget
            drag.target = document.querySelector<HTMLElement>(`[data-flip="${over}"]`)
            if (drag.target) drag.target.dataset.dropTarget = ''
            return
        }

        const order = frozen.filter((id) => id !== drag?.id)
        order.splice(frozen.indexOf(over), 0, drag.id)
        frozen = order
        requestAnimationFrame(follow); // The packer moved the cell's own place meanwhile
    }

    // Under the pointer wherever the grid placed the cell | offsets ignore the lift's scale
    function follow() {
        if (!drag?.from || !grid) return
        const frame = grid.getBoundingClientRect()
        const x = pointer.x - drag.grab.x - frame.left - drag.cell.offsetLeft
        const y = pointer.y - drag.grab.y - frame.top - drag.cell.offsetTop
        drag.cell.style.translate = `${x}px ${y}px`
    }

    // Lands in its new place, between the neighbours it ended up with
    async function drop() {
        if (!drag?.from) return void (drag = null)
        const { id, cell, from, target } = drag
        drag = null
        dropped = true
        setTimeout(() => (dropped = false));

        // A marked target reorders only now
        const order = target ? from.filter((other) => other !== id) : from
        if (target) {
            delete target.dataset.dropTarget
            order.splice(from.indexOf(target.dataset.flip!), 0, id)
        }
        const moved = order.some((other, index) => other !== from[index]);

        // Measured while still lifted, so the card glides from under the pointer along with the rest
        if (moved) snapshot()
        const lifted = cell.style.translate
        cell.style.translate = ''
        delete cell.dataset.dragging
        if (moved) frozen = order
        else cell.animate({ translate: [lifted, '0 0'] }, { duration: duration('base'), easing: cssEasing('emphasized') })

        const index = visible.findIndex((note) => note.id === id)
        const note = visible[index]
        if (!note || from.indexOf(id) === index) return void (frozen = null)

        const neighbour = (other: Note | undefined) => (other && (!sort.pinnedFirst || other.pinned === note.pinned) ? other : undefined)
        await safeAction(kept(moveNote({ id, position: positionBetween(neighbour(visible[index - 1]), neighbour(visible[index + 1]), sort.direction) })))
        if (!editing) frozen = null
    }

    // The release over its own card would open it
    function swallowDrop(event: MouseEvent) {
        if (!dropped) return false
        event.stopPropagation()
        event.preventDefault()
        return true
    }
</script>

<svelte:head>
    <title>{view?.name ?? 'Notes'} · notifica-ex</title>
</svelte:head>

<svelte:window onkeydown={onKey} onpointermove={dragMove} onpointerup={drop} onpointercancel={drop} />

<!-- Centered as a whole while few notes are around, the page scrolls once they fill the screen -->
<div class="my-auto flex flex-col pb-24 sm:pb-20">

<!-- NOTES | the open card counts twice, it spans two columns where they fit -->
{#if visible.length || editing?.fresh}
    <div class="@container">
        <div bind:this={grid} class="note-grid relative items-start" {@attach masonry} {@attach windowed && cards.watch} style:--notes={visible.length + (editing ? 1 : 0) + (editing?.fresh ? 1 : 0)}>
            {#if editing?.fresh}
                {#key editing.key}
                    <div class="note-cell fresh wide @container/note" data-flip={editing.id ?? 'new'} out:retreat|global>
                        <NoteView
                            bind:this={freshNote}
                            note={null}
                            defaults={noteDefaults(filter)}
                            {incoming}
                            open
                            {closing}
                            {labels}
                            {me}
                            {people}
                            reminders={(editing.id && remindersByNote.get(editing.id)) || []}
                            ondone={markDone}
                            oncreate={(id) => editing && (editing.id = id)}
                            onclose={closeEditor}
                        />
                    </div>
                {/key}
            {/if}
            {#each visible as note, index (note.id)}
                {@const open = editing?.id === note.id}
                <!-- A finger opens the menu with a long press, selecting goes through it | the open note keeps the trigger but turns it off -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class={['note-cell @container/note', open && 'wide']} data-flip={note.id} in:enter={{ id: note.id, index }} out:leave={note.id} onpointerdown={(event) => grab(event, note.id)} onclickcapture={(event) => swallowDrop(event) || modifiedClick(event, note.id)} onmousedown={(event) => holdTextSelection(event, note.id)} ondragstart={(event) => event.preventDefault()}>
                    {#if !windowed || open || index < CARDS_ALWAYS_SHOWN || cards.shows(note.id)}
                    <ContextMenu.Root>
                        <ContextMenu.Trigger class="block" disabled={open}>
                            <NoteView
                                {note}
                                {open}
                                closing={open && closing}
                                {labels}
                                {me}
                                {people}
                                reminders={remindersByNote.get(note.id) ?? []}
                                selected={selected.has(note.id)}
                                focus={open ? editing?.focus : undefined}
                                onopen={() => (selection.length ? selected.toggle(note.id) : edit(note))}
                                onlongpress={() => selected.toggle(note.id)}
                                ontoggle={(index) => tickTask(note, index)}
                                ondone={markDone}
                                onclose={closeEditor}
                            />
                        </ContextMenu.Trigger>
                        <ContextMenu.Portal>
                            <ContextMenu.Content class="menu" collisionPadding={12}>
                                <NoteMenu
                                    notes={targetsOf(note)}
                                    {labels}
                                    {me}
                                    reminders={remindersByNote}
                                    selected={selected.has(note.id)}
                                    onselect={() => selected.toggle(note.id)}
                                    onedit={(target, focus) => edit(target, focus)}
                                    onfinish={() => selected.clear()}
                                />
                            </ContextMenu.Content>
                        </ContextMenu.Portal>
                    </ContextMenu.Root>
                    {:else}
                        <div style:height="{cards.height(note)}px"></div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
{:else}
    <NotesEmpty gone={!view} blank={notes.length === 0} />
{/if}

</div>

<!-- TOOLBAR | floats at the bottom, on phones to the right of the menu button -->
<div class="toolbar vt-toolbar pointer-events-none fixed inset-x-0 z-30 flex justify-end px-gutter sm:left-rail sm:justify-center">
    {#if selection.length}
        <!-- SELECTION BAR | stands in for the toolbar while notes are selected -->
        <div class="pointer-events-auto flex min-w-0 items-center gap-0.5 rounded-full border border-line bg-raised p-1 pl-4 shadow-xl sm:gap-1 sm:pl-5" in:rise={{ y: 8, duration: 'base' }}>
            <span class="type-meta mr-1 text-ink sm:mr-2">{selection.length}<span class="max-sm:hidden"> selected</span></span>
            <NoteMenu bar notes={selection} {labels} {me} reminders={remindersByNote} onfinish={() => selected.clear()} />
            <span class="mx-1 h-6 w-px bg-line"></span>
            <button class="icon-button size-10 rounded-full" aria-label="Clear selection" onclick={() => selected.clear()}><X class="size-4" /></button>
        </div>
    {:else}
    <div class="pointer-events-auto flex min-w-0 items-center gap-3" in:rise={{ y: 8, duration: 'base' }}>
        <NoteToolbar
            {view}
            {filter}
            {sort}
            {labels}
            bind:search
            bind:button={createButton}
            creating={!!editing?.fresh}
            ontweak={(filter, sort) => (draft = { filter, sort })}
            onsaved={() => (draft = null)}
            oncreate={() => edit(null)}
        />
    </div>
    {/if}
</div>

<style>
    /* TOOLBAR | leaves room for the phone menu button on its left */
    .toolbar {
        --menu-room: 4.75rem;
        bottom: calc(1rem + env(safe-area-inset-bottom));
        padding-left: calc(var(--layout-content-gutter) + var(--menu-room));
    }

    @media (width >= 40rem) {
        .toolbar {
            --menu-room: 0rem;
            bottom: 1.5rem;
        }
    }

    /* Scrolling to an open note keeps it clear of the toolbar */
    .note-cell {
        scroll-margin: 1rem 0 calc(6.5rem + env(safe-area-inset-bottom));
    }

    /* DRAG | the held card lifts above the rest */
    .note-cell:global([data-dragging]) {
        z-index: 10;
        cursor: grabbing;
    }

    .note-cell:global([data-dragging] .card) {
        scale: 1.03;
        box-shadow: 0 1.5rem 3rem -1rem rgb(0 0 0 / 0.35);
    }

    .note-cell:global([data-drop-target] .card) {
        outline: 2px solid var(--theme-signature);
        outline-offset: 3px;
    }

    :global(body:has([data-dragging])) {
        cursor: grabbing;
        user-select: none;
    }

    /* NEW NOTE | starts in the button's colour and shape, the content follows once there is room */
    .fresh :global(.card) {
        animation: bloom var(--duration-slow) var(--ease-emphasized);
    }

    .fresh :global(.card > *) {
        animation: fade-in var(--duration-base) var(--ease-out) calc(var(--duration-slow) * 0.4) both;
    }

    @keyframes bloom {
        from { border-radius: 2rem; background-color: var(--theme-accent); }
    }

    @keyframes fade-in {
        from { opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
        .fresh :global(.card),
        .fresh :global(.card > *) { animation: none; }
    }
</style>
