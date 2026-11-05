<script lang="ts">
	import { afterNavigate, goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FilterEditor from '#lib/components/FilterEditor.svelte';
	import SortEditor from '#lib/components/SortEditor.svelte';
	import NoteView, { editor } from '#lib/components/Note.svelte';
	import NoteMenu from '#lib/components/NoteMenu.svelte';
	import { toggleTask } from '#lib/markdown.ts';
	import { masonry, pack } from '#lib/masonry.ts';
	import { cssEasing, duration, easing, glide, measure, offscreen, rise, stagger, unfold } from '#lib/motion.ts';
	import { removeNotes } from '#lib/deletions.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import { Selection, typing } from '#lib/selection.svelte.ts';
	import { tip } from '#lib/tooltip.svelte.ts';
	import type { Note, Reminder, ViewFilter, ViewSort } from '#lib/schemas.ts';
	import { defaultSort, emptyFilter, groupReminders, matchesView, noteDefaults, noteText, positionBetween, sameFilter, sortNotes, wordsOf } from '#lib/views.ts';
	import { ArrowUpDown, Check, ListFilter, Plus, Search, X } from '@lucide/svelte';
	import { ContextMenu, Popover } from 'bits-ui';
	import { flushSync, tick, untrack } from 'svelte';
	import type { TransitionConfig } from 'svelte/transition';
	import { getLabels } from '../../api/labels.remote';
	import { getNotes, moveNote, updateNote } from '../../api/notes.remote';
	import { getReminders, setReminderDone } from '../../api/reminders.remote';
	import { getPeople } from '../../api/users.remote';
	import { createView, getViews, updateView } from '../../api/views.remote';

	// DATA | refreshed by every command and by realtime events from other devices
	let [notes, labels, reminders, views, people] = $derived(await Promise.all([getNotes(), getLabels(), getReminders(), getViews(), getPeople()]));
	let me = $derived(page.data.user?.id ?? '');

	let remindersByNote = $derived(groupReminders(reminders));

	$effect(() => onCollectionChange<Note>('notes', () => getNotes().refresh(), shown));
	$effect(() => onCollectionChange('labels', () => getLabels().refresh()));
	$effect(() => onCollectionChange('reminders', () => getReminders().refresh()));

	// Own saves echo back through realtime, a second copy of every note would be wasted
	function shown({ action, record }: { action: string; record: Note }): boolean {
		const note = notes.find((item) => item.id === record.id);
		return action === 'delete' ? !note : note?.updated === record.updated;
	}

	// VIEW | the first one lives at the root, a deleted one leaves an empty page behind
	let view = $derived(page.params.view ? views.find((item) => item.id === page.params.view) : views[0]);

	// TWEAKS | a scratch copy of the view's filter until it gets saved, dropped on every navigation
	let draft = $state<{ filter: ViewFilter; sort: ViewSort } | null>(null);
	let search = $state('');
	let naming = $state(false);
	let newName = $state('');

	afterNavigate(({ type }) => {
		draft = null;
		naming = false;
		selected.clear();
		if (type === 'enter') return;
		shut();
	});

	let filter = $derived(draft?.filter ?? view?.filter ?? emptyFilter());
	let sort = $derived(draft?.sort ?? view?.sort ?? defaultSort());
	let filterTweaked = $derived(!!draft && !!view && !sameFilter(draft.filter, view.filter));
	let sortTweaked = $derived(!!draft && !!view && JSON.stringify(draft.sort) !== JSON.stringify(view.sort));
	let tweaked = $derived(filterTweaked || sortTweaked);

	// EDITOR STATE | a key per opening, so every note starts with a fresh draft
	let editing = $state<{ key: number; id: string | null; fresh: boolean; focus?: string } | null>(null);
	let frozen = $state.raw<string[] | null>(null);
	let opened = 0;

	// The open note stays even once it stops matching, a new one keeps its blank card up front
	let visible = $derived.by(() => {
		if (!view) return [];
		const context = { reminders: remindersByNote, now: new Date() };
		const words = wordsOf(search);
		const shown = notes.filter((note) => {
			if (note.id === editing?.id) return !editing.fresh;
			if (!matchesView(note, filter, context)) return false;
			const text = words.length ? noteText(note) : '';
			return words.every((word) => text.includes(word));
		});
		const sorted = sortNotes(shown, sort, remindersByNote);
		if (!frozen) return sorted;

		// Order holds still while a card is open, every autosave would reshuffle it otherwise
		const rank = new Map(frozen.map((id, index) => [id, index]));
		return sorted.toSorted((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
	});

	async function saveToView() {
		if (!view || !draft) return;
		if (await safeAction(updateView({ id: view.id, filter: draft.filter, sort: draft.sort }))) draft = null;
	}

	// SAVE AS NEW VIEW | asks for a name right in the popover, then opens the new view
	async function saveAsView() {
		const name = newName.trim();
		if (!name) return;
		const created = await safeAction(createView({ name, icon: 'star', filter, sort }));
		if (!created) return;
		newName = '';
		await goto(resolve('/(app)/[[view]]', { view: created.id }));
	}

	// SEARCH | an icon until opened, stays open while it holds text
	let searchInput = $state<HTMLInputElement>();
	let searchOpen = $state(false);

	async function openSearch() {
		searchOpen = true;
		await tick();
		searchInput?.focus({ preventScroll: true }); // Scrolling into view would slide the field under the icon while it is still narrow
	}

	function closeSearch() {
		search = '';
		searchOpen = false;
	}

	// Slash jumps to the search like on most sites
	function focusSearch(event: KeyboardEvent) {
		if (event.key !== '/' || typing(event)) return;
		event.preventDefault();
		openSearch();
	}

	// EDITING | one card at a time opens in place, a new note grows out of the create button
	let closing = $state(false);
	let freshNote = $state<{ flush: () => Promise<string | null> }>();
	let createButton = $state<HTMLElement>();
	let busy: Promise<unknown> = Promise.resolve();
	let origin: DOMRect | null = null;
	let handover: string | null = null;
	let returning = false;

	function edit(note: Note | null, focus?: string) {
		busy = busy.then(async () => {
			if (note && editing?.id === note.id) return;
			await fold();
			await editor.load(); // One glide only, a late editor would move the grid a second time | touch screens never preload it
			if (!note) origin = createButton?.getBoundingClientRect() ?? null;
			frozen = visible.map((item) => item.id);
			snapshot();
			editing = { key: ++opened, id: note?.id ?? null, fresh: !note, focus };
			closing = false;
			await tick();
			reveal(document.querySelector('.note.open')?.closest<HTMLElement>('[data-flip]'));
		});
	}

	// Brings the whole open note into view, its top first when it is taller than the screen
	// The cell already has the size and spot the glide ends with
	function reveal(cell: HTMLElement | null | undefined) {
		if (!cell) return;
		const style = getComputedStyle(cell);
		const room = innerHeight - parseFloat(style.scrollMarginTop) - parseFloat(style.scrollMarginBottom);
		cell.scrollIntoView({ block: cell.offsetHeight > room ? 'start' : 'nearest', behavior: 'smooth' });
	}

	function closeEditor() {
		busy = busy.then(async () => {
			if (!editing) return;
			await fold();
			snapshot();
			shut();
		});
	}

	function shut() {
		editing = null;
		frozen = null;
		closing = false;
	}

	// The open note's controls fade first | a new note then hands over to its card, or shrinks back into the button when empty
	async function fold() {
		handover = null;
		returning = false;
		if (!editing) return;

		closing = true;
		await new Promise((done) => setTimeout(done, duration('fast')));
		if (!editing?.fresh) return;

		const id = await freshNote?.flush();
		handover = id ?? null;
		returning = !id;
	}

	// RELAYOUT | every change to the grid glides the cells from where they were, the editor arriving late too
	let grid = $state<HTMLElement>();
	let before: Map<string, DOMRect> | undefined;

	// Rects before the next change, the first one wins until its glide ran | the button joins it even then
	function snapshot() {
		if (!grid) return;
		before ??= measure(grid);
		if (origin) before.set('new', origin);
		origin = null;
	}

	// What moves the grid
	const layoutInputs = () => [visible, editing?.id, editing?.key, editor.loaded];

	// Opening and closing take the snapshot themselves, a card may change before this runs then
	// Untracked, the grid binding alone would leave a snapshot that no glide ever takes
	$effect.pre(() => {
		layoutInputs();
		untrack(snapshot);
	});

	// Another view swaps the cells before the effect above runs, so cards on both glide from here
	onNavigate(({ to }) => {
		if (to?.route.id === page.route.id) snapshot();
	});

	// Waits for the effects of the cells too, the editor fills in its text only then
	// Not tick(), which waits a frame in async mode and shows the new layout unanimated meanwhile
	let pending = false;

	$effect(() => {
		layoutInputs();
		if (!before || pending) return;
		pending = true;
		queueMicrotask(() => {
			flushSync();
			const from = before;
			before = undefined;
			pending = false;
			if (grid && from) glide(grid, from, () => pack(grid!));
		});
	});

	const UNSEEN_FROM = 40; // Cards this far down the list skip their entrance, nobody sees it

	// New cards rise into place, the card taking over from a new note glides there instead
	function enter(node: Element, { id, index }: { id: string; index: number }): TransitionConfig {
		return id === handover || index >= UNSEEN_FROM ? {} : rise(node, { delay: stagger(index) });
	}

	// Leaving cards fade where they stood, out of the flow so the rest glide into their place
	function leave(node: HTMLElement, id: string): TransitionConfig {
		const from = before?.get(id) ?? node.getBoundingClientRect();
		delete node.dataset.flip;
		if (offscreen(from)) {
			node.style.display = 'none';
			return { duration: 1 }; // An empty transition ends at once, Svelte then never removes the card while others still fade
		}

		const frame = grid?.getBoundingClientRect();
		if (frame) Object.assign(node.style, { position: 'absolute', left: `${from.left - frame.left}px`, top: `${from.top - frame.top}px`, width: `${from.width}px` });

		return {
			duration: duration('fast'),
			easing: easing('out'),
			css: (t) => `opacity: ${t}; scale: ${0.97 + 0.03 * t};`
		};
	}

	// A saved new note makes room for its card at once, an empty one shrinks back into the button
	function retreat(node: HTMLElement): TransitionConfig {
		delete node.dataset.flip;
		const button = createButton;
		const body = node.querySelector<HTMLElement>('[data-flip-body]');
		const card = body?.querySelector<HTMLElement>('.card');
		if (!returning || !button || !grid || !body || !card) {
			node.style.display = 'none';
			return {};
		}

		// Starts where it is seen, an open glide still running included
		const from = body.getBoundingClientRect();
		[node, body].forEach((part) => part.getAnimations().forEach((animation) => animation.cancel()));
		const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius);

		// Out of the grid flow so the other cards can glide into its place meanwhile
		Object.assign(node.style, { position: 'absolute', height: '', zIndex: '1' });
		body.dataset.resizing = '';

		// Grid and button both move while the others settle, so both are read every frame
		const place = (t: number, u: number) => {
			const target = button.getBoundingClientRect();
			const frame = grid!.getBoundingClientRect();
			node.style.left = `${target.left + t * (from.left - target.left) - frame.left}px`;
			node.style.top = `${target.top + t * (from.top - target.top) - frame.top}px`;
			node.style.width = body.style.width = `${target.width + t * (from.width - target.width)}px`; // A wider cell would overhang the page near the button
			body.style.height = `${target.height + t * (from.height - target.height)}px`;
			card.style.borderRadius = `${radius + u * (target.height / 2 - radius)}px`;
		};
		place(1, 0);

		return {
			duration: duration('slow'),
			easing: easing('emphasized'),
			css: (t) => `opacity: ${Math.min(1, t * 3)};`,
			tick: place
		};
	}

	// Notification taps land on /?note=id | the address drops it first, that navigation would close the note again
	$effect(() => {
		const id = page.url.searchParams.get('note');
		if (!id) return;
		const note = untrack(() => notes.find((item) => item.id === id));
		goto(resolve('/(app)/[[view]]', { view: page.params.view }), { shallow: true, replace: true }).then(() => {
			if (note) edit(note);
		});
	});

	// The open note got deleted or unshared elsewhere, its card is gone so the editor goes too
	$effect(() => {
		if (!editing?.id || editing.fresh || notes.some((note) => note.id === editing?.id)) return;
		untrack(shut);
	});

	// SELECTION | a card click toggles while anything is selected, notes that vanished drop out on their own
	const selected = new Selection();
	let selection = $derived(notes.filter((note) => selected.has(note.id)));

	// Ctrl picks a single note, shift a range | an open card keeps its clicks
	function modifiedClick(event: MouseEvent, id: string) {
		if (editing?.id === id || (!event.shiftKey && !event.ctrlKey && !event.metaKey)) return;
		event.stopPropagation();
		event.preventDefault();
		if (event.shiftKey) selected.toggleRange(id, visible.map((note) => note.id));
		else selected.toggle(id);
	}

	// A shift press would otherwise mark the text between two cards
	function holdTextSelection(event: MouseEvent, id: string) {
		if (event.shiftKey && editing?.id !== id) event.preventDefault();
	}

	// A right click on a selected card acts on the whole selection
	function targetsOf(note: Note): Note[] {
		return selected.has(note.id) ? selection : [note];
	}

	let removing = false; // A second Delete while the dialog asks opens no second one
	async function removeSelection() {
		if (removing) return;
		removing = true;
		if (await removeNotes(selection, me)) selected.clear();
		removing = false;
	}

	function onKey(event: KeyboardEvent) {
		const menuOpen = event.defaultPrevented || document.querySelector('[role=menu]'); // Escape closes the menu first, the selection stays
		if (event.key === 'Escape' && selection.length && !editing && !menuOpen) {
			event.preventDefault();
			selected.clear();
		}
		else if (event.key === 'Delete' && selection.length && !editing && !menuOpen && !typing(event)) removeSelection();
		else focusSearch(event);
	}

	// QUICK ACTIONS ON CARDS
	function tickTask(note: Note, index: number) {
		safeAction(updateNote({ id: note.id, body: toggleTask(note.body, index) }));
	}

	function markDone(reminder: Reminder) {
		safeAction(setReminderDone(reminder.id));
	}

	// DRAG | the mouse moves cards in a manual sort, each card it passes gives up its place
	// Past this many cards the grid holds still until the drop, a reorder on every pass sends them all flying
	const LIVE_DRAG_LIMIT = 10;

	let drag: { id: string; cell: HTMLElement; start: { x: number; y: number }; grab: { x: number; y: number }; from: string[] | null; over: string | null; target: HTMLElement | null } | null = null;
	let pointer = { x: 0, y: 0 };
	let dropped = false;

	function grab(event: PointerEvent, id: string) {
		if (event.pointerType === 'touch' || event.button !== 0 || sort.by !== 'manual' || editing || selection.length) return;
		if (notes.find((note) => note.id === id)?.owner !== me) return; // The order of a shared note is its owner's
		const cell = event.currentTarget as HTMLElement;
		const rect = cell.getBoundingClientRect();
		drag = { id, cell, start: { x: event.clientX, y: event.clientY }, grab: { x: event.clientX - rect.left, y: event.clientY - rect.top }, from: null, over: null, target: null };
	}

	function dragMove(event: PointerEvent) {
		if (!drag) return;
		pointer = { x: event.clientX, y: event.clientY };

		// A few pixels of slack keep a plain click a click
		if (!drag.from) {
			if (Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) < 6) return;
			drag.from = visible.map((note) => note.id);
			frozen = drag.from;
			drag.cell.dataset.dragging = '';
		}
		follow();

		// The card under the pointer, the dragged one itself left out
		const over = document.elementsFromPoint(pointer.x, pointer.y).map((node) => node.closest<HTMLElement>('[data-flip]')).find((cell) => cell && cell !== drag?.cell)?.dataset.flip ?? null;
		if (over === drag.over) return;
		drag.over = over;
		if (!over || !frozen) return;

		// Pinned notes stay among themselves while they sort first
		const moving = notes.find((note) => note.id === drag?.id);
		const passed = notes.find((note) => note.id === over);
		if (!moving || !passed || (sort.pinnedFirst && moving.pinned !== passed.pinned)) return;

		// Many cards only mark where the drop lands
		if (frozen.length > LIVE_DRAG_LIMIT) {
			if (drag.target) delete drag.target.dataset.dropTarget;
			drag.target = document.querySelector<HTMLElement>(`[data-flip="${over}"]`);
			if (drag.target) drag.target.dataset.dropTarget = '';
			return;
		}

		const order = frozen.filter((id) => id !== drag?.id);
		order.splice(frozen.indexOf(over), 0, drag.id);
		frozen = order;
		requestAnimationFrame(follow); // The packer moved the cell's own place meanwhile
	}

	// Under the pointer wherever the grid placed the cell | offsets ignore the lift's scale
	function follow() {
		if (!drag?.from || !grid) return;
		const frame = grid.getBoundingClientRect();
		const x = pointer.x - drag.grab.x - frame.left - drag.cell.offsetLeft;
		const y = pointer.y - drag.grab.y - frame.top - drag.cell.offsetTop;
		drag.cell.style.translate = `${x}px ${y}px`;
	}

	// Lands in its new place, between the neighbours it ended up with
	async function drop() {
		if (!drag?.from) return void (drag = null);
		const { id, cell, from, target } = drag;
		drag = null;
		dropped = true;
		setTimeout(() => (dropped = false));

		// A marked target reorders only now
		const order = target ? from.filter((other) => other !== id) : from;
		if (target) {
			delete target.dataset.dropTarget;
			order.splice(from.indexOf(target.dataset.flip!), 0, id);
		}
		const moved = order.some((other, index) => other !== from[index]);

		// Measured while still lifted, so the card glides from under the pointer along with the rest
		if (moved) snapshot();
		const lifted = cell.style.translate;
		cell.style.translate = '';
		delete cell.dataset.dragging;
		if (moved) frozen = order;
		else cell.animate({ translate: [lifted, '0 0'] }, { duration: duration('base'), easing: cssEasing('emphasized') });

		const index = visible.findIndex((note) => note.id === id);
		const note = visible[index];
		if (!note || from.indexOf(id) === index) return void (frozen = null);

		const neighbour = (other: Note | undefined) => (other && (!sort.pinnedFirst || other.pinned === note.pinned) ? other : undefined);
		await safeAction(moveNote({ id, position: positionBetween(neighbour(visible[index - 1]), neighbour(visible[index + 1]), sort.direction) }));
		if (!editing) frozen = null;
	}

	// The release over its own card would open it
	function swallowDrop(event: MouseEvent) {
		if (!dropped) return false;
		event.stopPropagation();
		event.preventDefault();
		return true;
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
		<div bind:this={grid} class="note-grid relative items-start" {@attach masonry} style:--notes={visible.length + (editing ? 1 : 0) + (editing?.fresh ? 1 : 0)}>
			{#if editing?.fresh}
				{#key editing.key}
					<div class="note-cell fresh wide @container/note" data-flip={editing.id ?? 'new'} out:retreat|global>
						<NoteView
							bind:this={freshNote}
							note={null}
							defaults={noteDefaults(filter)}
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
				</div>
			{/each}
		</div>
	</div>
{:else}
	<!-- EMPTY STATE -->
	<section class="flex flex-col items-center pb-8 text-center">
		{#if !view}
			<h2 class="type-title mb-2 text-2xl text-ink">This view is gone</h2>
			<p class="max-w-xs text-ink-muted">It was deleted or never existed. <a href={resolve('/(app)/[[view]]', {})} class="text-accent hover:underline">Open the first view</a></p>
		{:else if notes.length === 0}
			<!-- Three loose sheets that drift on their own and fan out on hover -->
			<div class="stack relative mb-12 h-44 w-40" aria-hidden="true">
				<div class="sheet sheet-back absolute inset-0 rounded-card border border-line bg-secondary-soft"></div>
				<div class="sheet sheet-mid absolute inset-0 rounded-card border border-line bg-card"></div>
				<div class="sheet sheet-front absolute inset-0 flex flex-col gap-2.5 rounded-card border border-line-strong bg-raised p-5">
					<span class="h-2.5 w-3/4 rounded-full bg-accent"></span>
					<span class="h-1.5 w-full rounded-full bg-line-strong"></span>
					<span class="h-1.5 w-5/6 rounded-full bg-line-strong"></span>
					<span class="h-1.5 w-2/3 rounded-full bg-line-strong"></span>
					<span class="mt-auto h-5 w-14 rounded-full bg-accent-soft"></span>
				</div>
			</div>
			<h2 class="type-title mb-2 text-2xl text-ink">Nothing here yet</h2>
			<p class="max-w-xs text-ink-muted">Notes, lists and reminders will gather here as soon as you write the first one.</p>
		{:else}
			<h2 class="type-title mb-2 text-2xl text-ink">Nothing matches</h2>
			<p class="max-w-xs text-ink-muted">Try another view or search, or loosen the filter.</p>
		{/if}
	</section>
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
		<div class="flex min-w-0 items-center gap-1 rounded-full border border-line bg-raised p-0 shadow-xl">
			<div class={['search motion-interactive flex h-12 items-center rounded-full text-ink-muted', searchOpen && 'open']}>
				<button class="grid size-12 shrink-0 place-items-center rounded-full hover:text-ink" aria-label="Search notes" aria-expanded={searchOpen} onclick={() => (searchOpen ? searchInput?.focus() : openSearch())} {@attach tip('Search')}>
					<Search class="size-5" />
				</button>
				{#if searchOpen}
					<input
						bind:this={searchInput}
						bind:value={search}
						placeholder="Search"
						aria-label="Search notes"
						class="min-w-0 flex-1 bg-transparent pr-2 pl-1 text-ink outline-none placeholder:text-ink-faint"
						onblur={() => { if (!search) searchOpen = false; }}
						onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeSearch(); } }}
					/>
					<button class="icon-button mr-1.5 rounded-full p-1.5" aria-label="Close search" onclick={closeSearch}><X class="size-4" /></button>
				{/if}
			</div>

			<!-- SORT AND FILTER | tweak the open view, saving writes them into it -->
			<Popover.Root>
				<Popover.Trigger class={['motion-interactive relative grid size-12 shrink-0 place-items-center rounded-full hover:text-ink', sortTweaked ? 'text-accent' : 'text-ink-muted']} aria-label="Sort" {@attach tip(sortTweaked ? 'Sort, changed from the view' : 'Sort')}>
					<ArrowUpDown class="size-5" />
					{#if sortTweaked}<span class="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"></span>{/if}
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content side="top" sideOffset={12} collisionPadding={12} class="popover z-40 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl">
						<SortEditor {sort} onchange={(changed) => (draft = { filter, sort: changed })} />
						{@render viewActions()}
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>

			<Popover.Root>
				<Popover.Trigger class={['motion-interactive relative grid size-12 shrink-0 place-items-center rounded-full hover:text-ink', filterTweaked ? 'text-accent' : 'text-ink-muted']} aria-label="Filter" {@attach tip(filterTweaked ? 'Filter, changed from the view' : 'Filter')}>
					<ListFilter class="size-5" />
					{#if filterTweaked}<span class="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"></span>{/if}
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content side="top" sideOffset={12} collisionPadding={12} class="popover z-40 flex max-h-[min(44rem,var(--bits-popover-content-available-height))] w-[min(30rem,calc(100vw-1.5rem))] flex-col text-ink">
						<FilterEditor {filter} {labels} onchange={(changed) => (draft = { filter: changed, sort })} footer={viewActions} class="overflow-hidden rounded-card border border-line-strong bg-raised shadow-2xl" />
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</div>

		<!-- CREATE | grows into a blank note at the front of the grid, gone while that one is open -->
		<button bind:this={createButton} class={['create grid size-16 shrink-0 place-items-center rounded-full text-on-accent', editing?.fresh && 'away']} aria-label="New note" tabindex={editing?.fresh ? -1 : 0} onpointerenter={editor.load} onfocus={editor.load} onclick={() => edit(null)} {@attach tip('New note')}>
			<Plus class="plus size-7" strokeWidth={2.25} />
		</button>
	</div>
	{/if}
</div>

<!-- VIEW ACTIONS | shared by the sort and filter popovers, a shaded band once something differs from the view -->
{#snippet viewActions()}
	{#if tweaked}
		<footer class="flex flex-wrap items-center gap-2 border-t border-line bg-line/50 px-5 py-3" transition:unfold>
			{#if naming}
				<form class="flex min-w-0 flex-1 gap-2" onsubmit={(event) => { event.preventDefault(); saveAsView(); }}>
					<!-- svelte-ignore a11y_autofocus -->
					<input bind:value={newName} autofocus placeholder="Name of the new view" aria-label="Name of the new view" class="min-w-0 flex-1 rounded-control border border-line bg-raised px-3 py-1.5 outline-none focus:border-accent" />
					<button class="action primary" disabled={!newName.trim()}><Check class="size-3.5" />Create</button>
					<button type="button" class="action" aria-label="Cancel" onclick={() => (naming = false)}><X class="size-3.5" /></button>
				</form>
			{:else}
				<button class="action" onclick={() => (naming = true)}>Save as new view</button>
				<button class="action primary ml-auto" onclick={saveToView}><Check class="size-3.5" />Save to {view?.name}</button>
			{/if}
		</footer>
	{/if}
{/snippet}

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

	.search {
		width: 3rem;
		overflow: clip;
		transition: width var(--duration-slow) var(--ease-emphasized);
	}

	.search.open {
		width: min(22rem, calc(100vw - 2 * var(--layout-content-gutter) - var(--menu-room) - 8.5rem));
	}

	/* The field and its close button fade in while the pill slides open */
	.search > :not(:first-child) {
		animation: fade-in var(--duration-base) var(--ease-out) var(--duration-fast) both;
	}

	/* CREATE | the fill glows from within, hover lets the light spill out and sweeps a sheen across */
	.create {
		position: relative;
		isolation: isolate;
		background: radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--theme-accent) 72%, white), var(--theme-accent) 62%);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.35),
			0 0.75rem 1.75rem -0.75rem color-mix(in oklab, var(--theme-accent) 70%, transparent);
		transition:
			scale var(--duration-base) var(--ease-spring),
			box-shadow var(--duration-base) var(--ease-out),
			opacity var(--duration-base) var(--ease-out),
			width var(--duration-slow) var(--ease-emphasized),
			margin var(--duration-slow) var(--ease-emphasized);
	}

	/* Gives up its room too, the gap included, so search and filter glide to the centre */
	.create.away {
		width: 0;
		margin-left: -0.75rem;
		opacity: 0;
		scale: 0.6;
		pointer-events: none;
	}

	.create::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: var(--theme-accent);
		box-shadow: 0 0 1rem 0.5rem var(--theme-accent);
		opacity: 0.3;
		scale: 0.8;
		transition: opacity var(--duration-slow) var(--ease-out), scale var(--duration-slow) var(--ease-spring);
	}

	.create::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: linear-gradient(115deg, transparent 35%, rgb(255 255 255 / 0.45) 50%, transparent 65%) 150% 0 / 250% 100% no-repeat;
		pointer-events: none;
	}

	.create:hover,
	.create:focus-visible {
		scale: 1.06;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.45),
			0 0.875rem 2rem -0.75rem color-mix(in oklab, var(--theme-accent) 80%, transparent);
	}

	.create:hover::before,
	.create:focus-visible::before {
		opacity: 0.4;
		scale: 0.95;
	}

	.create:hover::after {
		animation: sheen 0.9s var(--ease-out) forwards;
	}

	.create:active {
		scale: 0.92;
	}

	.create :global(.plus) {
		transition: rotate var(--duration-slow) var(--ease-spring);
	}

	.create:hover :global(.plus) {
		rotate: 90deg;
	}

	@keyframes sheen {
		from { background-position: 150% 0; }
		to { background-position: -50% 0; }
	}

	@media (prefers-reduced-motion: reduce) {
		.create:hover::after { animation: none; }
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

	/* FILTERS */
	.action {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 999px;
		color: var(--theme-ink-muted);
		font-size: 0.875rem;
		white-space: nowrap;
		transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
	}

	.action:hover { background: var(--theme-line); color: var(--theme-ink); }
	.action:disabled { opacity: 0.5; pointer-events: none; }

	.action.primary { background: var(--theme-accent); color: var(--theme-on-accent); }
	.action.primary:hover { background: color-mix(in oklab, var(--theme-accent) 88%, white); }

	.sheet {
		transition: translate var(--duration-slow) var(--ease-spring), rotate var(--duration-slow) var(--ease-spring);
	}

	.sheet-back { rotate: 9deg; translate: 18px -6px; }
	.sheet-mid { rotate: -6deg; translate: -14px 4px; }
	.sheet-front { animation: drift 7s var(--ease-in-out) infinite alternate; }

	.stack:hover .sheet-back { rotate: 18deg; translate: 46px -10px; }
	.stack:hover .sheet-mid { rotate: -14deg; translate: -44px 6px; }

	@keyframes drift {
		from { translate: 0 0; rotate: -1deg; }
		to { translate: 0 -8px; rotate: 1.5deg; }
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet-front { animation: none; }
	}
</style>
