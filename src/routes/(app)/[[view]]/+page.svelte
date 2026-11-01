<script lang="ts">
	import { afterNavigate, goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FilterEditor from '#lib/components/FilterEditor.svelte';
	import NoteView, { editor } from '#lib/components/Note.svelte';
	import NoteMenu from '#lib/components/NoteMenu.svelte';
	import { toggleTask } from '#lib/markdown.ts';
	import { duration, easing, glide, measure, rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import { tip } from '#lib/tooltip.svelte.ts';
	import type { Note, Reminder, ViewFilter, ViewSort } from '#lib/schemas.ts';
	import { defaultSort, emptyFilter, groupReminders, matchesView, noteText, sameFilter, sortNotes, wordsOf } from '#lib/views.ts';
	import { Check, Ellipsis, ListFilter, Plus, Search, X } from '@lucide/svelte';
	import { ContextMenu, DropdownMenu, Popover } from 'bits-ui';
	import { tick, untrack } from 'svelte';
	import type { TransitionConfig } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';
	import { getLabels } from '../../api/labels.remote';
	import { getNotes, getPeople, updateNote } from '../../api/notes.remote';
	import { getReminders, setReminderDone } from '../../api/reminders.remote';
	import { createView, getViews, updateView } from '../../api/views.remote';
	import type { PageProps } from './$types';

	// PROPS
	let { data }: PageProps = $props();
	let me = $derived(data.user.id);

	// DATA | refreshed by every command and by realtime events from other devices
	let [notes, labels, reminders, views, people] = $derived(await Promise.all([getNotes(), getLabels(), getReminders(), getViews(), getPeople()]));

	let remindersByNote = $derived(groupReminders(reminders));
	let peopleById = $derived(new Map(people.map((person) => [person.id, person])));

	$effect(() => onCollectionChange('notes', () => Promise.all([getNotes().refresh(), getPeople().refresh()])));
	$effect(() => onCollectionChange('labels', () => getLabels().refresh()));
	$effect(() => onCollectionChange('reminders', () => getReminders().refresh()));

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
		editing = null;
		frozen = null;
		closing = false;
	});

	let filter = $derived(draft?.filter ?? view?.filter ?? emptyFilter());
	let sort = $derived(draft?.sort ?? view?.sort ?? defaultSort());
	let tweaked = $derived(!!draft && !!view && (!sameFilter(draft.filter, view.filter) || JSON.stringify(draft.sort) !== JSON.stringify(view.sort)));

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
			return matchesView(note, filter, context) && words.every((word) => noteText(note).includes(word));
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
		const target = event.target as HTMLElement;
		if (event.key !== '/' || target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
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
			if (!note) {
				await editor.load(); // One glide only, a late editor would move the grid a second time
				origin = createButton?.getBoundingClientRect() ?? null;
			}
			frozen = visible.map((item) => item.id);
			snapshot();
			editing = { key: ++opened, id: note?.id ?? null, fresh: !note, focus };
			closing = false;
			await tick();
			document.querySelector('.note.open')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	}

	function closeEditor() {
		busy = busy.then(async () => {
			if (!editing) return;
			await fold();
			snapshot();
			editing = null;
			frozen = null;
			closing = false;
		});
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

	// Opening and closing take the snapshot themselves, a card may change before this runs then
	// Untracked, the grid binding alone would leave a snapshot that no glide ever takes
	$effect.pre(() => {
		void [visible, editing?.id, editing?.key, editor.loaded];
		untrack(snapshot);
	});

	// Another view swaps the cells before the effect above runs, so cards on both glide from here
	onNavigate(({ to }) => {
		if (to?.route.id === page.route.id) snapshot();
	});

	// Waits for the effects of the cells too, the editor fills in its text only then
	let pending = false;

	$effect(() => {
		void [visible, editing?.id, editing?.key, editor.loaded];
		if (!before || pending) return;
		pending = true;
		tick().then(() => {
			const from = before;
			before = undefined;
			pending = false;
			if (grid && from) glide(grid, from);
		});
	});

	// New cards rise into place, the card taking over from a new note glides there instead
	function enter(node: Element, { id, index }: { id: string; index: number }): TransitionConfig {
		return id === handover ? {} : rise(node, { delay: stagger(index) });
	}

	// Leaving cards fade where they stood, out of the flow so the rest glide into their place
	function leave(node: HTMLElement, id: string): TransitionConfig {
		const from = before?.get(id) ?? node.getBoundingClientRect();
		const frame = grid?.getBoundingClientRect();
		delete node.dataset.flip;
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
		const from = node.getBoundingClientRect();
		[node, body].forEach((part) => part.getAnimations().forEach((animation) => animation.cancel()));
		const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius);

		// Out of the grid flow so the other cards can glide into its place meanwhile
		Object.assign(node.style, { position: 'absolute', width: `${from.width}px`, height: '', zIndex: '1' });
		body.dataset.resizing = '';

		// Grid and button both move while the others settle, so both are read every frame
		const place = (t: number, u: number) => {
			const target = button.getBoundingClientRect();
			const frame = grid!.getBoundingClientRect();
			node.style.left = `${target.left + t * (from.left - target.left) - frame.left}px`;
			node.style.top = `${target.top + t * (from.top - target.top) - frame.top}px`;
			body.style.width = `${target.width + t * (from.width - target.width)}px`;
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

	// SELECTION | a card click toggles while anything is selected, notes that vanished drop out on their own
	const selected = new SvelteSet<string>();
	let selection = $derived(notes.filter((note) => selected.has(note.id)));

	function toggleSelected(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	// A right click on a selected card acts on the whole selection
	function targetsOf(note: Note): Note[] {
		return selected.has(note.id) ? selection : [note];
	}

	function onKey(event: KeyboardEvent) {
		const menuOpen = event.defaultPrevented || document.querySelector('[role=menu]'); // Escape closes the menu first, the selection stays
		if (event.key === 'Escape' && selection.length && !editing && !menuOpen) selected.clear();
		else focusSearch(event);
	}

	// QUICK ACTIONS ON CARDS
	function tickTask(note: Note, index: number) {
		safeAction(updateNote({ id: note.id, body: toggleTask(note.body, index) }));
	}

	function markDone(reminder: Reminder) {
		safeAction(setReminderDone({ id: reminder.id, done: true }));
	}
</script>

<svelte:head>
	<title>{view?.name ?? 'Notes'} · notifica-ex</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<!-- Centered as a whole while few notes are around, the page scrolls once they fill the screen -->
<div class="my-auto flex flex-col pb-24 sm:pb-20">

<!-- NOTES | the open card counts twice, it spans two columns where they fit -->
{#if visible.length || editing?.fresh}
	<div class="@container">
		<div bind:this={grid} class="note-grid relative grid-flow-row-dense items-start" style:--notes={visible.length + (editing ? 1 : 0) + (editing?.fresh ? 1 : 0)}>
			{#if editing?.fresh}
				{#key editing.key}
					<div class="note-cell fresh wide @container/note" data-flip={editing.id ?? 'new'} out:retreat|global>
						<NoteView
							bind:this={freshNote}
							note={(editing.id && notes.find((item) => item.id === editing?.id)) || null}
							{me}
							people={peopleById}
							open
							{closing}
							{labels}
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
				<div class={['note-cell @container/note', open && 'wide']} data-flip={note.id} in:enter={{ id: note.id, index }} out:leave={note.id}>
					<ContextMenu.Root>
						<ContextMenu.Trigger class="block" disabled={open}>
							<NoteView
								{note}
								{me}
								people={peopleById}
								{open}
								closing={open && closing}
								{labels}
								reminders={remindersByNote.get(note.id) ?? []}
								selected={selected.has(note.id)}
								focus={open ? editing?.focus : undefined}
								onopen={() => (selection.length ? toggleSelected(note.id) : edit(note))}
								onlongpress={() => toggleSelected(note.id)}
								ontoggle={(index) => tickTask(note, index)}
								ondone={markDone}
								onclose={closeEditor}
							/>
						</ContextMenu.Trigger>
						<ContextMenu.Portal>
							<ContextMenu.Content class="menu" collisionPadding={12}>
								<NoteMenu
									notes={targetsOf(note)}
									{me}
									{labels}
									reminders={remindersByNote}
									selected={selected.has(note.id)}
									onselect={() => toggleSelected(note.id)}
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

<!-- TOOLBAR | floats at the bottom, above the phone rail -->
<div class="toolbar vt-toolbar pointer-events-none fixed inset-x-0 z-30 flex justify-center px-gutter sm:left-rail">
	{#if selection.length}
		<!-- SELECTION BAR | stands in for the toolbar while notes are selected -->
		<div class="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-raised/85 p-1 pl-5 shadow-xl backdrop-blur-xl" in:rise={{ y: 8, duration: 'base' }}>
			<span class="type-meta mr-2 text-ink">{selection.length} selected</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="motion-interactive grid size-10 place-items-center rounded-full bg-accent text-on-accent hover:brightness-110" aria-label="Actions for the selection" {@attach tip('Change the selected notes')}>
					<Ellipsis class="size-5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content class="menu" side="top" sideOffset={10} collisionPadding={12}>
						<NoteMenu notes={selection} {me} {labels} reminders={remindersByNote} onfinish={() => selected.clear()} />
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<button class="icon-button rounded-full" aria-label="Clear selection" onclick={() => selected.clear()}><X class="size-4" /></button>
		</div>
	{:else}
	<div class="pointer-events-auto flex min-w-0 items-center gap-3" in:rise={{ y: 8, duration: 'base' }}>
		<div class="flex min-w-0 items-center gap-1 rounded-full border border-line bg-raised/85 p-0 shadow-xl backdrop-blur-xl">
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
						onkeydown={(event) => { if (event.key === 'Escape') closeSearch(); }}
					/>
					<button class="icon-button mr-1.5 rounded-full p-1.5" aria-label="Close search" onclick={closeSearch}><X class="size-4" /></button>
				{/if}
			</div>

			<!-- FILTER | tweaks the open view, saving writes them into it -->
			<Popover.Root>
				<Popover.Trigger class={['motion-interactive relative grid size-12 shrink-0 place-items-center rounded-full hover:text-ink', tweaked ? 'text-accent' : 'text-ink-muted']} aria-label="Filter" {@attach tip(tweaked ? 'Filter, changed from the view' : 'Filter and sort')}>
					<ListFilter class="size-5" />
					{#if tweaked}<span class="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"></span>{/if}
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content side="top" sideOffset={12} collisionPadding={12} class="popover z-40 flex max-h-[min(42rem,var(--bits-popover-content-available-height))] w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden">
						<div class="min-h-0 overflow-y-auto p-5">
							<FilterEditor {filter} {sort} {labels} onchange={(changedFilter, changedSort) => (draft = { filter: changedFilter, sort: changedSort })} />
						</div>

						<footer class="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
							{#if naming}
								<form class="flex min-w-0 flex-1 gap-2" onsubmit={(event) => { event.preventDefault(); saveAsView(); }}>
									<!-- svelte-ignore a11y_autofocus -->
									<input bind:value={newName} autofocus placeholder="Name of the new view" aria-label="Name of the new view" class="min-w-0 flex-1 rounded-control border border-line bg-card px-3 py-1.5 outline-none focus:border-accent" />
									<button class="action primary" disabled={!newName.trim()}><Check class="size-3.5" />Create</button>
									<button type="button" class="action" aria-label="Cancel" onclick={() => (naming = false)}><X class="size-3.5" /></button>
								</form>
							{:else}
								<button class="action" onclick={() => (naming = true)}>Save as new view</button>
								{#if tweaked}
									<button class="action" onclick={() => (draft = null)}>Reset</button>
									<button class="action primary ml-auto" onclick={saveToView}><Check class="size-3.5" />Save to {view?.name}</button>
								{/if}
							{/if}
						</footer>
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

<style>
	/* TOOLBAR | clears the phone rail, sits low on wider screens */
	.toolbar {
		bottom: calc(5.5rem + env(safe-area-inset-bottom));
	}

	@media (width >= 40rem) {
		.toolbar {
			bottom: 1.5rem;
		}
	}

	.search {
		width: 3rem;
		overflow: clip;
		transition: width var(--duration-slow) var(--ease-emphasized);
	}

	.search.open {
		width: min(22rem, calc(100vw - 2 * var(--layout-content-gutter) - 8.5rem));
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
		filter: blur(1rem);
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
