<script lang="ts">
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import FilterEditor from '#lib/components/FilterEditor.svelte';
	import NoteCard from '#lib/components/NoteCard.svelte';
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import { rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import type { Note, ViewFilter, ViewSort } from '#lib/schemas.ts';
	import { defaultSort, emptyFilter, matchesView, noteText, sameFilter, sortNotes, wordsOf } from '#lib/views.ts';
	import { Check, ListFilter, Plus, Search, X } from '@lucide/svelte';
	import { Popover } from 'bits-ui';
	import { flip } from 'svelte/animate';
	import { getLabels } from '../../api/labels.remote';
	import { getNotes, updateNote } from '../../api/notes.remote';
	import { getReminders, setReminderDone } from '../../api/reminders.remote';
	import { createView, getViews, updateView } from '../../api/views.remote';

	// DATA | refreshed by every command and by realtime events from other devices
	let [notes, labels, reminders, views] = $derived(await Promise.all([getNotes(), getLabels(), getReminders(), getViews()]));

	let labelsById = $derived(new Map(labels.map((label) => [label.id, label])));
	let remindersByNote = $derived(new Map(reminders.map((reminder) => [reminder.note, reminder])));

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

	// Slash jumps to the search like on most sites
	let searchInput = $state<HTMLInputElement>();

	function focusSearch(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.key !== '/' || target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
		event.preventDefault();
		searchInput?.focus();
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
	function toggleItem(note: Note, itemId: string) {
		const items = (note.items ?? []).map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
		safeAction(updateNote({ id: note.id, items }));
	}

	function markDone(note: Note) {
		const reminder = remindersByNote.get(note.id);
		if (reminder) safeAction(setReminderDone({ id: reminder.id, done: true }));
	}
</script>

<svelte:head>
	<title>{view?.name ?? 'Notes'} · notifica-ex</title>
</svelte:head>

<svelte:window onkeydown={focusSearch} />

<!-- Centered as a whole while few notes are around, the page scrolls once they fill the screen -->
<div class="my-auto flex flex-col gap-[clamp(2.5rem,9dvh,6.5rem)]">

<!-- TOOLBAR -->
<div class="mx-auto flex w-full max-w-xl items-center gap-3">
	<label class="motion-interactive flex h-12 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-line bg-card pr-2 pl-4 text-ink-faint focus-within:border-accent hover:border-line-strong">
		<Search class="size-4 shrink-0" />
		<!-- Keeps the caret clear of the input edge -->
		<input bind:this={searchInput} bind:value={search} placeholder="Search" aria-label="Search notes" class="min-w-0 flex-1 bg-transparent pl-1 text-ink outline-none placeholder:text-ink-faint" />
		{#if search}
			<button class="icon-button rounded-full p-1.5" aria-label="Clear search" onclick={() => (search = '')}><X class="size-4" /></button>
		{:else}
			<kbd class="type-meta mr-1.5 hidden rounded-md border border-line px-1.5 py-0.5 text-ink-faint sm:block" aria-hidden="true">/</kbd>
		{/if}
	</label>

	<!-- FILTER | tweaks the open view, saving writes them into it -->
	<Popover.Root>
		<Popover.Trigger class={['motion-interactive relative grid size-12 shrink-0 place-items-center rounded-full border bg-card hover:border-line-strong hover:text-ink', tweaked ? 'border-accent text-accent' : 'border-line text-ink-faint']} aria-label="Filter">
			<ListFilter class="size-5" />
			{#if tweaked}<span class="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"></span>{/if}
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content sideOffset={10} collisionPadding={12} class="filters z-40 flex max-h-[min(42rem,var(--bits-popover-content-available-height))] w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl">
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

	<!-- CREATE | the editor grows out of this button -->
	<button class="create grid size-16 shrink-0 place-items-center rounded-full" aria-label="New note" onclick={(event) => create(event.currentTarget)}>
		<Plus class="plus size-7" strokeWidth={2.25} />
	</button>
</div>

<!-- NOTES -->
{#if visible.length}
	<div class="note-grid items-start">
		{#each visible as note, index (note.id)}
			<div animate:flip={{ duration: 280 }} in:rise={{ delay: stagger(index) }}>
				<NoteCard
					{note}
					labels={labelsById}
					reminder={remindersByNote.get(note.id)}
					onopen={(origin) => edit(note, origin)}
					ontoggle={(itemId) => toggleItem(note, itemId)}
					ondone={() => markDone(note)}
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
	/* CREATE | quiet ink button, hover lifts it a pixel and fades in a hairline ring */
	.create {
		position: relative;
		background: var(--theme-ink);
		color: var(--theme-canvas);
		box-shadow: 0 0.5rem 1.25rem -0.75rem rgb(0 0 0 / 0.6);
		transition:
			translate var(--duration-base) var(--ease-spring),
			scale var(--duration-base) var(--ease-spring),
			box-shadow var(--duration-base) var(--ease-out);
	}

	.create::before {
		content: '';
		position: absolute;
		inset: -0.3125rem;
		border: 1px solid var(--theme-ink);
		border-radius: inherit;
		opacity: 0;
		scale: 0.92;
		transition: opacity var(--duration-base) var(--ease-out), scale var(--duration-slow) var(--ease-spring);
	}

	.create:hover,
	.create:focus-visible {
		translate: 0 -1px;
		box-shadow: 0 0.75rem 1.5rem -0.75rem rgb(0 0 0 / 0.7);
	}

	.create:hover::before,
	.create:focus-visible::before {
		opacity: 0.3;
		scale: 1;
	}

	.create:active {
		translate: 0 0;
		scale: 0.94;
	}

	.create :global(.plus) {
		transition: rotate var(--duration-slow) var(--ease-spring);
	}

	.create:hover :global(.plus) {
		rotate: 90deg;
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
