<script lang="ts">
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FilterEditor from '#lib/components/FilterEditor.svelte';
	import NoteCard from '#lib/components/NoteCard.svelte';
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import NoteMenu from '#lib/components/NoteMenu.svelte';
	import { toggleTask } from '#lib/markdown.ts';
	import { morph, rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import type { Note, Reminder, ViewFilter, ViewSort } from '#lib/schemas.ts';
	import { defaultSort, emptyFilter, groupReminders, matchesView, noteText, sameFilter, sortNotes, wordsOf } from '#lib/views.ts';
	import { Check, Ellipsis, ListFilter, Plus, Search, X } from '@lucide/svelte';
	import { ContextMenu, DropdownMenu, Popover } from 'bits-ui';
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import { getLabels } from '../../api/labels.remote';
	import { getNotes, updateNote } from '../../api/notes.remote';
	import { getReminders, setReminderDone } from '../../api/reminders.remote';
	import { createView, getViews, updateView } from '../../api/views.remote';

	// DATA | refreshed by every command and by realtime events from other devices
	let [notes, labels, reminders, views] = $derived(await Promise.all([getNotes(), getLabels(), getReminders(), getViews()]));

	let labelsById = $derived(new Map(labels.map((label) => [label.id, label])));
	let remindersByNote = $derived(groupReminders(reminders));

	$effect(() => onCollectionChange('notes', () => getNotes().refresh()));
	$effect(() => onCollectionChange('labels', () => getLabels().refresh()));
	$effect(() => onCollectionChange('reminders', () => getReminders().refresh()));

	// VIEW | the first one lives at the root, a deleted one leaves an empty page behind
	let view = $derived(page.params.view ? views.find((item) => item.id === page.params.view) : views[0]);

	// TWEAKS | a scratch copy of the view's filter until it gets saved, dropped on every navigation
	let draft = $state<{ filter: ViewFilter; sort: ViewSort } | null>(null);
	let search = $state('');
	let naming = $state(false);
	let newName = $state('');

	afterNavigate(() => {
		draft = null;
		naming = false;
		selected.clear();
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
		searchInput?.focus();
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

	// EDITING | one card at a time opens in place, a new note starts as a blank card up front
	async function edit(note: Note | null, focus?: string) {
		if (note && editing?.id === note.id) return;
		await morph(() => {
			frozen = visible.map((item) => item.id);
			editing = { key: ++opened, id: note?.id ?? null, fresh: !note, focus };
		});
		document.querySelector('.editor')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	function closeEditor() {
		morph(() => {
			editing = null;
			frozen = null;
		});
	}

	// Notification taps land on /?note=id
	$effect(() => {
		const id = page.url.searchParams.get('note');
		if (!id) return;
		const note = notes.find((item) => item.id === id);
		if (note) edit(note);
		replaceState(resolve('/(app)/[[view]]', { view: page.params.view }), {});
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
		<div class="note-grid grid-flow-row-dense items-start" style:--notes={visible.length + (editing ? 1 : 0) + (editing?.fresh ? 1 : 0)}>
			{#if editing?.fresh}
				{#key editing.key}
					<div class="note-cell vt-note wide" style:--vt-name="note-{editing.id ?? 'new'}" in:rise>
						<NoteEditor
							note={null}
							{labels}
							reminders={(editing.id && remindersByNote.get(editing.id)) || []}
							oncreate={(id) => editing && (editing.id = id)}
							onclose={closeEditor}
						/>
					</div>
				{/key}
			{/if}
			{#each visible as note, index (note.id)}
				<div class={['note-cell vt-note', editing?.id === note.id && 'wide']} style:--vt-name="note-{note.id}" animate:flip={{ duration: 280 }} in:rise={{ delay: stagger(index) }}>
					{#if editing?.id === note.id}
						{#key editing.key}
							<NoteEditor
								{note}
								{labels}
								reminders={remindersByNote.get(note.id) ?? []}
								focus={editing.focus}
								onclose={closeEditor}
							/>
						{/key}
					{:else}
						<!-- A finger opens the menu with a long press, selecting goes through it -->
						<ContextMenu.Root>
							<ContextMenu.Trigger class="block">
								<NoteCard
									{note}
									labels={labelsById}
									reminders={remindersByNote.get(note.id) ?? []}
									selected={selected.has(note.id)}
									onopen={() => (selection.length ? toggleSelected(note.id) : edit(note))}
									onlongpress={() => toggleSelected(note.id)}
									ontoggle={(index) => tickTask(note, index)}
									ondone={markDone}
								/>
							</ContextMenu.Trigger>
							<ContextMenu.Portal>
								<ContextMenu.Content class="menu" collisionPadding={12}>
									<NoteMenu
										notes={targetsOf(note)}
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
					{/if}
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
<div class="toolbar pointer-events-none fixed inset-x-0 z-30 flex justify-center px-gutter sm:left-rail">
	{#if selection.length}
		<!-- SELECTION BAR | stands in for the toolbar while notes are selected -->
		<div class="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-raised/85 p-1 pl-5 shadow-xl backdrop-blur-xl" in:rise={{ y: 8, duration: 'base' }}>
			<span class="type-meta mr-2 text-ink">{selection.length} selected</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="motion-interactive grid size-10 place-items-center rounded-full bg-accent text-on-accent hover:brightness-110" aria-label="Actions for the selection">
					<Ellipsis class="size-5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content class="menu" side="top" sideOffset={10} collisionPadding={12}>
						<NoteMenu notes={selection} {labels} reminders={remindersByNote} onfinish={() => selected.clear()} />
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<button class="icon-button rounded-full" aria-label="Clear selection" onclick={() => selected.clear()}><X class="size-4" /></button>
		</div>
	{:else}
	<div class="pointer-events-auto flex min-w-0 items-center gap-3" in:rise={{ y: 8, duration: 'base' }}>
		<div class="flex min-w-0 items-center gap-1 rounded-full border border-line bg-raised/85 p-0 shadow-xl backdrop-blur-xl">
			<div class={['search motion-interactive flex h-12 items-center rounded-full text-ink-muted', searchOpen && 'open']}>
				<button class="grid size-12 shrink-0 place-items-center rounded-full hover:text-ink" aria-label="Search notes" aria-expanded={searchOpen} onclick={() => (searchOpen ? searchInput?.focus() : openSearch())}>
					<Search class="size-5" />
				</button>
				{#if searchOpen}
					<input
						bind:this={searchInput}
						bind:value={search}
						placeholder="Search"
						aria-label="Search notes"
						class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint"
						onblur={() => { if (!search) searchOpen = false; }}
						onkeydown={(event) => { if (event.key === 'Escape') closeSearch(); }}
					/>
					<button class="icon-button mr-1.5 rounded-full p-1.5" aria-label="Close search" onclick={closeSearch}><X class="size-4" /></button>
				{/if}
			</div>

			<!-- FILTER | tweaks the open view, saving writes them into it -->
			<Popover.Root>
				<Popover.Trigger class={['motion-interactive relative grid size-12 shrink-0 place-items-center rounded-full hover:text-ink', tweaked ? 'text-accent' : 'text-ink-muted']} aria-label="Filter">
					<ListFilter class="size-5" />
					{#if tweaked}<span class="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"></span>{/if}
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content side="top" sideOffset={12} collisionPadding={12} class="filters z-40 flex max-h-[min(42rem,var(--bits-popover-content-available-height))] w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl">
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

		<!-- CREATE | opens a blank card at the front of the grid -->
		<button class="create grid size-16 shrink-0 place-items-center rounded-full text-on-accent" aria-label="New note" onclick={() => edit(null)}>
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
		transition: width var(--duration-base) var(--ease-spring);
	}

	.search.open {
		width: min(22rem, calc(100vw - 2 * var(--layout-gutter) - 8.5rem));
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
			box-shadow var(--duration-base) var(--ease-out);
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
			0 1rem 2.5rem -0.75rem var(--theme-accent);
	}

	.create:hover::before,
	.create:focus-visible::before {
		opacity: 0.75;
		scale: 1.45;
		animation: breathe 2.4s var(--ease-in-out) infinite alternate;
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

	@keyframes breathe {
		to { opacity: 0.45; scale: 1.25; }
	}

	@keyframes sheen {
		from { background-position: 150% 0; }
		to { background-position: -50% 0; }
	}

	@media (prefers-reduced-motion: reduce) {
		.create:hover::before,
		.create:hover::after { animation: none; }
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

	:global(.filters[data-state='open']) {
		transform-origin: var(--bits-popover-content-transform-origin);
		animation: pop-in var(--duration-base) var(--ease-spring);
	}

	:global(.filters[data-state='closed']) {
		transform-origin: var(--bits-popover-content-transform-origin);
		animation: pop-in var(--duration-fast) var(--ease-in) reverse forwards;
	}

	@keyframes pop-in {
		from { opacity: 0; scale: 0.94; }
	}

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
