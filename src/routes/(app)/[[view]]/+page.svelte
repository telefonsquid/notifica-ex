<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NoteCard from '#lib/components/NoteCard.svelte';
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import { rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onRecordChange } from '#lib/realtime.ts';
	import type { Note } from '#lib/schemas.ts';
	import { Check, ListFilter, Plus, Search, X } from '@lucide/svelte';
	import { Popover } from 'bits-ui';
	import { flip } from 'svelte/animate';
	import { getLabels } from '../api/labels.remote';
	import { getNotes, updateNote } from '../api/notes.remote';
	import { getReminders, setReminderDone } from '../api/reminders.remote';

	// DATA | refreshed by every command and by realtime events from other devices
	let [notes, labels, reminders] = $derived(await Promise.all([getNotes(), getLabels(), getReminders()]));

	let labelsById = $derived(new Map(labels.map((label) => [label.id, label])));
	let remindersByNote = $derived(new Map(reminders.map((reminder) => [reminder.note, reminder])));

	$effect(() => onRecordChange('notes', () => getNotes().refresh()));
	$effect(() => onRecordChange('labels', () => getLabels().refresh()));
	$effect(() => onRecordChange('reminders', () => getReminders().refresh()));

	// FILTERS
	type View = 'notes' | 'reminders' | 'archive';
	const VIEWS: { value: View; label: string }[] = [
		{ value: 'notes', label: 'Notes' },
		{ value: 'reminders', label: 'Reminders' },
		{ value: 'archive', label: 'Archive' }
	];

	let view = $state<View>('notes');
	let label = $state<string | null>(null);
	let search = $state('');
	let filtered = $derived(view !== 'notes' || !!label);

	let visible = $derived.by(() => {
		const words = search.toLowerCase().split(/\s+/).filter(Boolean);
		const shown = notes.filter((note) => {
			if (view === 'archive' ? !note.archived : note.archived) return false;
			if (view === 'reminders' && !remindersByNote.has(note.id)) return false;
			if (label && !note.labels.includes(label)) return false;
			const text = [note.title, note.body, ...(note.items ?? []).map((item) => item.text)].join(' ').toLowerCase();
			return words.every((word) => text.includes(word));
		});

		// Reminders run in the order they go off, notes put pinned ones first
		if (view === 'reminders') {
			const next = (note: Note) => remindersByNote.get(note.id)?.next || '9999';
			return shown.toSorted((a, b) => next(a).localeCompare(next(b)));
		}
		if (view === 'notes') return shown.toSorted((a, b) => Number(b.pinned) - Number(a.pinned));
		return shown;
	});

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
		replaceState(resolve('/(app)'), {});
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
	<title>Notes · notifica-ex</title>
</svelte:head>

<svelte:window onkeydown={focusSearch} />

<!-- Centered as a whole while few notes are around, the page scrolls once they fill the screen -->
<div class="my-auto flex flex-col gap-[clamp(2.5rem,9dvh,6.5rem)]">

<!-- TOOLBAR -->
<div class="mx-auto flex w-full max-w-xl items-center gap-3">
	<label class="motion-interactive flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line bg-card pr-2 pl-4 text-ink-faint focus-within:border-accent hover:border-line-strong">
		<Search class="size-4 shrink-0" />
		<input bind:this={searchInput} bind:value={search} placeholder="Search" aria-label="Search notes" class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint" />
		{#if search}
			<button class="icon-button rounded-full p-1.5" aria-label="Clear search" onclick={() => (search = '')}><X class="size-4" /></button>
		{:else}
			<kbd class="type-meta mr-1.5 hidden rounded-md border border-line px-1.5 py-0.5 text-ink-faint sm:block" aria-hidden="true">/</kbd>
		{/if}
	</label>

	<!-- FILTER -->
	<Popover.Root>
		<Popover.Trigger class={['motion-interactive relative grid size-12 shrink-0 place-items-center rounded-full border bg-card hover:border-line-strong hover:text-ink', filtered ? 'border-accent text-accent' : 'border-line text-ink-faint']} aria-label="Filter">
			<ListFilter class="size-5" />
			{#if filtered}<span class="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"></span>{/if}
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content sideOffset={10} collisionPadding={12} class="filters z-40 grid w-72 gap-5 rounded-card border border-line-strong bg-raised p-4 text-ink shadow-2xl">
				<div class="grid grid-cols-3 gap-1 rounded-control bg-line p-1" role="group" aria-label="View">
					{#each VIEWS as option (option.value)}
						<button
							class={['type-meta motion-interactive rounded-[calc(var(--layout-radius-control)-0.25rem)] py-2', view === option.value ? 'bg-card text-ink' : 'text-ink-faint hover:text-ink-muted']}
							aria-pressed={view === option.value}
							onclick={() => (view = option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>

				{#if labels.length}
					<div>
						<p class="type-meta mb-2 text-ink-faint">Labels</p>
						<ul class="-mx-2 grid max-h-64 overflow-y-auto">
							{#each labels as item (item.id)}
								<li>
									<button
										class={['motion-interactive flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-line', label === item.id ? 'text-ink' : 'text-ink-muted']}
										aria-pressed={label === item.id}
										onclick={() => (label = label === item.id ? null : item.id)}
									>
										<span class="note-mark h-2 w-6 shrink-0 rounded-full" data-note={item.color || undefined}></span>
										<span class="min-w-0 flex-1 truncate">{item.name}</span>
										{#if label === item.id}<Check class="size-4 text-accent" />{/if}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if filtered}
					<button class="type-meta justify-self-start text-ink-faint hover:text-ink" onclick={() => { view = 'notes'; label = null; }}>Reset</button>
				{/if}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>

	<!-- CREATE | the editor grows out of this button -->
	<button class="create grid size-16 shrink-0 place-items-center rounded-full text-on-accent" aria-label="New note" onclick={(event) => create(event.currentTarget)}>
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
		{#if notes.length === 0}
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
			<p class="max-w-xs text-ink-muted">Try another view, label or search.</p>
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
	/* CREATE | a silver ring spins up behind the fill while hovered */
	.create {
		position: relative;
		isolation: isolate;
		transition: scale var(--duration-base) var(--ease-spring);
	}

	.create::before,
	.create::after {
		content: '';
		position: absolute;
		z-index: -1;
		border-radius: inherit;
	}

	.create::before {
		inset: -0.25rem;
		background: conic-gradient(#fff, #8c8c8c, #ececec, #6e6e6e, #fff); /* Light and dark streaks read as metal on both themes */
		opacity: 0;
		transition: opacity var(--duration-base) var(--ease-out);
		animation: spin 2.4s linear infinite;
	}

	.create::after {
		inset: 0;
		background: var(--theme-accent);
		box-shadow: 0 0.75rem 2rem -0.5rem color-mix(in oklab, var(--theme-accent) 55%, transparent);
		transition: box-shadow var(--duration-base) var(--ease-out);
	}

	.create:hover::before,
	.create:focus-visible::before {
		opacity: 1;
	}

	.create:hover::after {
		box-shadow: 0 1rem 2.75rem -0.5rem color-mix(in oklab, var(--theme-accent) 75%, transparent);
	}

	.create:hover {
		scale: 1.06;
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

	@keyframes spin {
		to { rotate: 1turn; }
	}

	/* FILTERS */
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
		.sheet-front,
		.create::before { animation: none; }
	}
</style>
