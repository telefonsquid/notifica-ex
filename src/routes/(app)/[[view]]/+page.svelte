<script lang="ts">
    import { afterNavigate, goto } from '$app/navigation'
    import { resolve } from '$app/paths'
    import { page } from '$app/state'
    import { CARD_WINDOW_FROM, CARDS_ALWAYS_SHOWN, CardWindow } from '#lib/card_window.svelte.ts'
    import NoteView from '#lib/components/Note.svelte'
    import NoteMenu from '#lib/components/NoteMenu.svelte'
    import NotesEmpty from '#lib/components/NotesEmpty.svelte'
    import NoteToolbar from '#lib/components/NoteToolbar.svelte'
    import { masonry } from '#lib/masonry.ts'
    import { rise } from '#lib/motion.ts';
    import { NoteDrag } from '#lib/note_drag.ts';
    import { noteEditor } from '#lib/note_editor.svelte.ts';
    import { NoteGrid } from '#lib/note_grid.svelte.ts';
    import { NoteOpening } from '#lib/note_opening.svelte.ts';
    import { hiddenNotes, removeNotes } from '#lib/note_removal.ts';
    import { onAndroidEvent } from '#lib/android.ts';
    import { takeShare } from '#lib/android_share.ts';
    import { restoreDrafts } from '#lib/draft_restore.ts'
    import { keepEvents } from '#lib/note_list.ts'
    import { reveal } from '#lib/note_lock.svelte.ts'
    import { notify } from '#lib/notifications.svelte.ts'
    import { dialogOpen, menuOpen, typing } from '#lib/overlays.ts'
    import { onCollectionChange } from '#lib/realtime.ts'
    import { Selection } from '#lib/selection.svelte.ts'
    import type { Note } from '#lib/schemas/notes.ts';
    import type { ViewFilter, ViewSort } from '#lib/schemas/views.ts';
    import { autoColorOrder } from '#lib/auto_colors.ts';
    import { groupReminders } from '#lib/reminders.ts';
    import { freshDefaults } from '#lib/notes.ts';
    import { defaultSort, emptyFilter, matchesView, noteDefaults, noteText, sortNotes, wordsOf } from '#lib/views.ts';
    import { linkedNote, linkedReschedule } from '#lib/links.ts';
    import RescheduleDialog from '#lib/components/RescheduleDialog.svelte'
    import { NEW_CELL } from '#lib/relayout.ts';
    import { tip } from '#lib/tooltip.svelte.ts'
    import { CheckCheck, X } from '@lucide/svelte'
    import { ContextMenu } from 'bits-ui'
    import { onMount, untrack } from 'svelte'
    import { getLabels } from '../../api/labels.remote'
    import { getNotes } from '../../api/notes.remote'
    import { getReminders } from '../../api/reminders.remote'
    import { getPeople } from '../../api/users.remote'
    import { getViews } from '../../api/views.remote';

    // DATA | saves and realtime events merge single notes into the list, the rest refresh
    let [stored, labels, reminders, views, people] = $derived(await Promise.all([getNotes(), getLabels(), getReminders(), getViews(), getPeople()]))
    let notes = $derived(reveal(hiddenNotes.size ? stored.filter((note) => !hiddenNotes.has(note.id)) : stored))      // Locked notes with their text once unlocked
    let me: string = $derived(page.data.user.id)

    let remindersByNote = $derived(groupReminders(reminders))

    $effect(() => onCollectionChange<Note>('notes', keepEvents, shown))
    $effect(() => onCollectionChange('labels', () => getLabels().refresh()))
    $effect(() => onCollectionChange('reminders', () => getReminders().refresh()));

    // Own saves echo back through realtime, a second copy of every note would be wasted
    function shown({ action, record }: { action: string; record: Note }): boolean {
        const note = stored.find((item) => item.id === record.id)
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
        opening.shut()
    })

    let filter = $derived(draft?.filter ?? view?.filter ?? emptyFilter())
    let sort = $derived(draft?.sort ?? view?.sort ?? defaultSort());

    // A label picked on a card's tab narrows the view to it, the Filter popover can save or clear that
    function showOnly(id: string){
        draft = { filter: { ...filter, include: [id], exclude: filter.exclude.filter((item) => item !== id) }, sort }
    }

    // EDITING | one card at a time opens, the grid holds its order meanwhile
    const grid = new NoteGrid()
    const opening = new NoteOpening(grid, () => visible.map((note) => note.id))
    const { enter, retreat } = opening      // Transition directives take plain names
    const { leave } = grid
    let editing = $derived(opening.current);

    // The open note stays even once it stops matching, a new one keeps its blank card up front
    let visible = $derived.by(() => {
        if (!view) return []
        const context = { reminders: remindersByNote, now: new Date(), autoColors: autoColorOrder(labels) }
        const words = wordsOf(search)
        const shown = notes.filter((note) => {
            if (note.id === editing?.id) return !editing.fresh
            if (!matchesView(note, filter, context)) return false
            const text = words.length ? noteText(note) : ''
            return words.every((word) => text.includes(word))
        })
        return grid.ordered(sortNotes(shown, sort, remindersByNote))
    });

    grid.follow(() => [visible, editing?.id, editing?.key, !!noteEditor.component]);

    // LONG LISTS | cards far off screen wait as empty boxes
    const cards = new CardWindow()
    let windowed = $derived(visible.length > CARD_WINDOW_FROM)

    // SHARED FROM ANOTHER APP | waits in the Android app until this page is up
    function takeShared() {
        const shared = takeShare()
        if (!shared) return
        if (shared.unread) notify('Some of the shared images could not be read.', { type: 'error' })
        opening.openShared(shared)
    }

    onMount(() => {
        restoreDrafts(() => notes, () => labels, me)
        takeShared()
        return onAndroidEvent(takeShared)
    })

    // Notification taps land on noteLink() | the address drops it first, that navigation would close the note again
    // Reschedule asks for the new time instead of opening the note
    let rescheduling = $state<{ occurrence: string, title: string } | null>(null)

    $effect(() => {
        const id = linkedNote(page.url)
        if (!id) return
        const occurrence = linkedReschedule(page.url)
        const note = untrack(() => notes.find((item) => item.id === id))
        goto(resolve('/(app)/[[view]]', { view: page.params.view }), { shallow: true, replace: true }).then(() => {
            if (occurrence) rescheduling = { occurrence, title: note?.title || 'Reschedule' }
            else if (note) opening.edit(note)
        })
    });

    // The open note got deleted or unshared elsewhere, its card is gone so the editor goes too
    $effect(() => {
        if (!editing?.id || editing.fresh || notes.some((note) => note.id === editing?.id)) return
        untrack(opening.shut)
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

    // Cards move by pointer, the browser's own drag would carry images and text off | the editor drags its checklist items itself
    function stopNativeDrag(event: DragEvent) {
        if (!(event.target as Element).closest?.('.ProseMirror')) event.preventDefault()
    }

    // A right click on a selected card acts on the whole selection
    function targetsOf(note: Note): Note[] {
        return selected.has(note.id) ? selection : [note]
    }

    function selectAll() {
        selected.add(visible.map((note) => note.id))
    }

    function removeSelection() {
        removeNotes(selection, me)
        selected.clear()
    }

    function onKey(event: KeyboardEvent) {
        const menu = event.defaultPrevented || menuOpen(); // Escape closes the menu first, the selection stays
        if (event.key === 'Escape' && selection.length && !editing && !menu) {
            event.preventDefault()
            selected.clear()
        }
        else if (event.key === 'Delete' && selection.length && !editing && !menu && !typing(event)) removeSelection()
        else if (event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && visible.length && !editing && !menu && !typing(event) && !dialogOpen()) {
            event.preventDefault()
            selectAll()
        }
        else if (event.key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !editing && !selection.length && !menu && !typing(event) && !dialogOpen()) {
            event.preventDefault()
            opening.edit(null)
        }
    }

    // DRAG
    const drag = new NoteDrag(grid, {
        notes: () => notes,
        visible: () => visible,
        sort: () => sort,
        me: () => me,
        editing: () => !!editing,
        selecting: () => selection.length > 0
    })
</script>

<svelte:head>
    <title>{view?.name ?? 'Notes'} · notifica-ex</title>
</svelte:head>

<svelte:window onkeydown={onKey} onpointermove={drag.move} onpointerup={drag.drop} onpointercancel={drag.drop} />

<!-- Centered as a whole while few notes are around, the page scrolls once they fill the screen -->
<div class="my-auto flex flex-col pb-[calc(var(--layout-bottom-clear)+1rem)] sm:pb-20">

<!-- NOTES | the open card counts twice, it spans two columns where they fit -->
{#if visible.length || editing?.fresh}
    <div class="@container">
        <div bind:this={grid.element} class="note-grid relative items-start" {@attach masonry} {@attach windowed && cards.watch} style:--notes={visible.length + (editing ? 1 : 0) + (editing?.fresh ? 1 : 0)}>
            {#if editing?.fresh}
                {#key editing.key}
                    <div class="note-cell fresh wide @container/note" data-flip={editing.id ?? NEW_CELL} out:retreat|global>
                        <NoteView
                            bind:this={opening.freshNote}
                            note={null}
                            defaults={freshDefaults(noteDefaults(filter), page.data.user.noteColor)}
                            seed={editing.shared}
                            open
                            closing={opening.closing}
                            {labels}
                            {me}
                            {people}
                            reminders={(editing.id && remindersByNote.get(editing.id)) || []}
                            oncreate={opening.created}
                            onclose={opening.close}
                        />
                    </div>
                {/key}
            {/if}
            {#each visible as note, index (note.id)}
                {@const open = editing?.id === note.id}
                {@const afloat = open ? editing?.afloat : null}
                <!-- A finger opens the menu with a long press, selecting goes through it | the open note keeps the trigger but turns it off -->
                <!-- A floating note keeps its cell as a ghost, the frame inside carries the note to the centre -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class={['note-cell', open && !afloat && 'wide', afloat && 'afloat', afloat && opening.closing && 'closing']}
                    data-flip={note.id}
                    data-flip-centred={afloat ? '' : undefined}
                    style:--ghost={afloat && `${afloat.ghost}px`}
                    style:--float-x={afloat && `${afloat.x}px`}
                    style:--float-y={afloat && `${afloat.y}px`}
                    style:--float-width={afloat && `${afloat.width}px`}
                    in:enter={{ id: note.id, index }}
                    out:leave={note.id}
                    onpointerdown={(event) => drag.grab(event, note.id)}
                    onclickcapture={(event) => drag.swallow(event) || modifiedClick(event, note.id)}
                    onmousedown={(event) => holdTextSelection(event, note.id)}
                    ondragstart={stopNativeDrag}
                    {@attach afloat ? opening.float : null}
                >
                    <div class="frame @container/note" {@attach afloat && opening.resizes ? opening.sizer : null}>
                    {#if !windowed || open || index < CARDS_ALWAYS_SHOWN || cards.shows(note.id)}
                    <ContextMenu.Root>
                        <ContextMenu.Trigger class="block" disabled={open}>
                            <NoteView
                                {note}
                                {open}
                                closing={open && opening.closing}
                                {labels}
                                {me}
                                {people}
                                reminders={remindersByNote.get(note.id) ?? []}
                                selected={selected.has(note.id)}
                                focus={open ? editing?.focus : undefined}
                                onopen={() => (selection.length ? selected.toggle(note.id) : opening.edit(note))}
                                onlongpress={() => selected.toggle(note.id)}
                                onselect={() => selected.toggle(note.id)}
                                onlabel={showOnly}
                                onclose={opening.close}
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
                                    onedit={(target, focus) => opening.edit(target, focus)}
                                    onfinish={() => selected.clear()}
                                />
                            </ContextMenu.Content>
                        </ContextMenu.Portal>
                    </ContextMenu.Root>
                    {:else}
                        <div style:height="{cards.height(note)}px"></div>
                    {/if}
                    </div>
                </div>
            {/each}
        </div>
    </div>
{:else}
    <NotesEmpty gone={!view} blank={notes.length === 0} />
{/if}

</div>

<RescheduleDialog occurrence={rescheduling?.occurrence ?? null} title={rescheduling?.title ?? ''} onclose={() => rescheduling = null} />

<!-- TOOLBAR | floats at the bottom, on phones to the right of the menu button -->
<div class="toolbar vt-toolbar pointer-events-none fixed inset-x-0 z-30 flex justify-end px-gutter sm:left-rail sm:justify-center">
    {#if selection.length}
        <!-- SELECTION BAR | stands in for the toolbar while notes are selected -->
        <div class="pointer-events-auto flex min-w-0 items-center gap-0.5 rounded-full border border-line bg-raised p-1 pl-4 shadow-xl sm:gap-1 sm:pl-5" in:rise={{ y: 8, duration: 'base' }}>
            <span class="type-meta mr-1 text-ink sm:mr-2">{selection.length}<span class="ml-[0.3em] max-sm:hidden">selected</span></span>
            <NoteMenu bar notes={selection} {labels} {me} reminders={remindersByNote} onfinish={() => selected.clear()} />
            <span class="mx-1 h-6 w-px bg-line"></span>
            <button class="icon-button size-10 rounded-full" aria-label="Select all" disabled={selection.length >= visible.length} onclick={selectAll} {@attach tip('Select all')}><CheckCheck class="size-4" /></button>
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
            bind:button={opening.createButton}
            creating={!!editing?.fresh}
            ontweak={(filter, sort) => (draft = { filter, sort })}
            onsaved={() => (draft = null)}
            oncreate={() => opening.edit(null)}
        />
    </div>
    {/if}
</div>

<style>
    /* TOOLBAR | leaves room for the phone menu button on its left */
    .toolbar {
        --menu-room: calc(var(--layout-menu-button) + 0.75rem);
        bottom: var(--layout-bottom-row);
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
        scroll-margin: 1rem 0 calc(var(--layout-bottom-clear) + 1.5rem);
    }

    /* AFLOAT | the open note leaves the grid alone and floats over the dimmed page | its cell stays behind as a sunken ghost */
    .note-cell.afloat {
        position: relative;
        z-index: 2;
        min-height: var(--ghost);
    }

    .afloat > .frame {
        position: absolute;
        left: var(--float-x);
        top: var(--float-y);
        width: var(--float-width);
        max-height: calc(100dvh - 10rem);
        translate: -50% -50%;
    }

    .afloat :global([data-flip-card]) {
        max-height: calc(100dvh - 10rem);
        overflow-y: auto;
        overscroll-behavior: contain;
    }

    /* The text scrolls on its own so the formatting bar and the reminder band stay at the card's bottom */
    .afloat :global([data-flip-card]:has(.editor)) {
        overflow: hidden;
    }

    .afloat :global(.content:has(> .editor)),
    .afloat :global(.editor) {
        flex: 1 1 auto;
        min-height: 0;
    }

    .afloat :global(.editor > :is(.rich, textarea)) {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
    }

    /* A note sized by its grip fills the frame */
    .afloat > .frame:global([data-resized]) > :global(:not(.resize-grip)),
    .afloat > .frame:global([data-resized]) :global(.note),
    .afloat > .frame:global([data-resized]) :global([data-flip-card]) {
        height: 100%;
    }

    /* The dim covers the whole page and takes its clicks, which land outside the note and close it | the toolbar stays above */
    .note-cell.afloat::before,
    .note-cell.afloat::after {
        content: '';
        position: absolute;
        z-index: -1;
        transition: opacity var(--duration-base) var(--ease-out);

        @starting-style {
            opacity: 0;
        }
    }

    .note-cell.afloat::before {
        inset: -200vmax;
        background: rgb(0 0 0 / 0.3);
    }

    /* The ghost is a faint black card with a wide soft shadow, as if the note still floated above it */
    .note-cell.afloat::after {
        inset: 0;
        border-radius: var(--layout-radius-card);
        background: black;
        box-shadow: 0 0.75rem 2rem 0.5rem black;
        opacity: 0.07;
        pointer-events: none;
    }

    .note-cell.afloat.closing::before,
    .note-cell.afloat.closing::after {
        opacity: 0;
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
