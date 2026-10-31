<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NoteCard from '#lib/components/NoteCard.svelte';
	import NoteEditor from '#lib/components/NoteEditor.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onRecordChange } from '#lib/realtime.ts';
	import type { Note, NoteKind } from '#lib/schemas.ts';
	import Button from '#lib/ui/Button.svelte';
	import { ListChecks, Plus, Search, X } from '@lucide/svelte';
	import { flip } from 'svelte/animate';
	import { getLabels } from '../api/labels.remote';
	import { getNotes, updateNote } from '../api/notes.remote';
	import { getReminders, setReminderDone } from '../api/reminders.remote';
	import type { PageProps } from './$types';

	// PROPS
	let { data }: PageProps = $props();

	const firstName = $derived(data.user.name?.split(' ')[0]);

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

	let visible = $derived.by(() => {
		const words = search.toLowerCase().split(/\s+/).filter(Boolean);
		const shown = notes.filter((note) => {
			if (view === 'archive' ? !note.archived : note.archived) return false;
			if (view === 'reminders' && !remindersByNote.has(note.id)) return false;
			if (label && !note.labels.includes(label)) return false;
			const text = [note.title, note.body, ...(note.items ?? []).map((item) => item.text)].join(' ').toLowerCase();
			return words.every((word) => text.includes(word));
		});

		// Reminders run in the order they go off, the rest keep pinned first
		if (view !== 'reminders') return shown;
		const next = (note: Note) => remindersByNote.get(note.id)?.next || '9999';
		return shown.toSorted((a, b) => next(a).localeCompare(next(b)));
	});

	let pinned = $derived(view === 'notes' ? visible.filter((note) => note.pinned) : []);
	let others = $derived(view === 'notes' ? visible.filter((note) => !note.pinned) : visible);

	// EDITOR | a key per opening, so every note starts with a fresh draft
	let editing = $state<{ key: number; note: Note | null; kind: NoteKind } | null>(null);
	let opened = 0;

	function edit(note: Note | null, kind: NoteKind = 'text') {
		editing = { key: ++opened, note, kind };
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

<PageHeader eyebrow={firstName ? `Hi ${firstName}` : undefined} title="Notes">
	{#snippet actions()}
		<Button style="secondary" icon={ListChecks} onclick={() => edit(null, 'list')}>List</Button>
		<Button icon={Plus} onclick={() => edit(null)}>Note</Button>
	{/snippet}
</PageHeader>

<!-- FILTERS -->
<div class="mb-8 flex flex-col gap-4">
	<div class="flex flex-wrap items-center gap-3">
		<div class="flex items-center gap-1 rounded-control bg-line p-1" role="group" aria-label="View">
			{#each VIEWS as option (option.value)}
				<button
					class={['type-meta motion-interactive rounded-[calc(var(--layout-radius-control)-0.25rem)] px-3.5 py-2', view === option.value ? 'bg-raised text-ink' : 'text-ink-faint hover:text-ink-muted']}
					aria-pressed={view === option.value}
					onclick={() => (view = option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>

		<label class="motion-interactive flex h-10 min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-card px-3 text-ink-faint focus-within:border-accent sm:max-w-xs">
			<Search class="size-4 shrink-0" />
			<input bind:value={search} placeholder="Search" class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint" />
			{#if search}
				<button aria-label="Clear search" onclick={() => (search = '')}><X class="size-4" /></button>
			{/if}
		</label>
	</div>

	{#if labels.length}
		<div class="flex flex-wrap gap-1.5" role="group" aria-label="Labels">
			{#each labels as item (item.id)}
				<button
					class={['type-meta motion-interactive rounded-full border px-3 py-1.5', label === item.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-faint hover:text-ink-muted']}
					aria-pressed={label === item.id}
					onclick={() => (label = label === item.id ? null : item.id)}
				>
					{item.name}
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- NOTES -->
{#snippet grid(list: Note[])}
	<div class="note-grid items-start">
		{#each list as note, index (note.id)}
			<div animate:flip={{ duration: 280 }} in:rise={{ delay: stagger(index) }}>
				<NoteCard
					{note}
					labels={labelsById}
					reminder={remindersByNote.get(note.id)}
					onopen={() => edit(note)}
					ontoggle={(itemId) => toggleItem(note, itemId)}
					ondone={() => markDone(note)}
				/>
			</div>
		{/each}
	</div>
{/snippet}

{#if pinned.length}
	<h2 class="type-meta mb-3 text-ink-faint">Pinned</h2>
	{@render grid(pinned)}
	{#if others.length}<h2 class="type-meta mt-10 mb-3 text-ink-faint">Others</h2>{/if}
{/if}

{#if others.length}
	{@render grid(others)}
{:else if !pinned.length}
	<!-- EMPTY STATE -->
	<section class="flex flex-col items-center py-16 text-center sm:py-24">
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

{#if editing}
	{#key editing.key}
		<NoteEditor
			note={editing.note}
			kind={editing.kind}
			{labels}
			reminders={remindersByNote}
			onclose={() => (editing = null)}
		/>
	{/key}
{/if}

<style>
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
