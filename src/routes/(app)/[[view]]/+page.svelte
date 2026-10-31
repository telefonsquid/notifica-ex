<script lang="ts">
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FilterEditor from '#lib/components/FilterEditor.svelte';
	import NoteCard from '#lib/components/NoteCard.svelte';
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import { toggleTask } from '#lib/markdown.ts';
	import { rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import type { Note, Reminder, ViewFilter, ViewSort } from '#lib/schemas.ts';
	import { defaultSort, emptyFilter, groupReminders, matchesView, noteText, sameFilter, sortNotes, wordsOf } from '#lib/views.ts';
	import { Check, ListFilter, Plus, Search, X } from '@lucide/svelte';
	import { Popover } from 'bits-ui';
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
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
	});

	let filter = $derived(draft?.filter ?? view?.filter ?? emptyFilter());
	let sort = $derived(draft?.sort ?? view?.sort ?? defaultSort());
	let tweaked = $derived(!!draft && !!view && (!sameFilter(draft.filter, view.filter) || JSON.stringify(draft.sort) !== JSON.stringify(view.sort)));

	let visible = $derived.by(() => {
		if (!view) return [];
		const context = { reminders: remindersByNote, now: new Date() };
		const words = wordsOf(search);
		const shown = notes.filter((note) => matchesView(note, filter, context) && words.every((word) => noteText(note).includes(word)));
		return sortNotes(shown, sort, remindersByNote);
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

	// EDITOR | a key per opening, so every note starts with a fresh draft
	type Origin = { x: number; y: number };
	let editing = $state<{ key: number; note: Note | null; origin?: Origin } | null>(null);
	let opened = 0;

	function edit(note: Note | null, origin?: Origin) {
		editing = { key: ++opened, note, origin };
	}

	function create(button: HTMLElement) {
		const box = button.getBoundingClientRect();
		edit(null, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
	}

	// Notification taps land on /?note=id
	$effect(() => {
		const id = page.url.searchParams.get('note');
		if (!id) return;
		const note = notes.find((item) => item.id === id);
		if (note) edit(note);
		replaceState(resolve('/(app)/[[view]]', { view: page.params.view }), {});
	});

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

<svelte:window onkeydown={focusSearch} />

<!-- Centered as a whole while few notes are around, the page scrolls once they fill the screen -->
<div class="my-auto flex flex-col pb-24 sm:pb-20">

<!-- NOTES -->
{#if visible.length}
	<div class="note-grid items-start" style:--notes={visible.length}>
		{#each visible as note, index (note.id)}
			<div animate:flip={{ duration: 280 }} in:rise={{ delay: stagger(index) }}>
				<NoteCard
					{note}
					labels={labelsById}
					reminders={remindersByNote.get(note.id) ?? []}
					onopen={(origin) => edit(note, origin)}
					ontoggle={(index) => tickTask(note, index)}
					ondone={markDone}
				/>
			</div>
		{/each}
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
	<div class="pointer-events-auto flex min-w-0 items-center gap-3">
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

		<!-- CREATE | the editor grows out of this button -->
		<button class="create grid size-16 shrink-0 place-items-center rounded-full text-on-accent" aria-label="New note" onclick={(event) => create(event.currentTarget)}>
			<Plus class="plus size-7" strokeWidth={2.25} />
		</button>
	</div>
</div>

{#if editing}
	{#key editing.key}
		<NoteEditor
			note={editing.note}
			origin={editing.origin}
			{labels}
			reminders={remindersByNote}
			onclose={() => (editing = null)}
		/>
	{/key}
{/if}

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
