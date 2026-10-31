<script lang="ts">
	import { PUBLIC_NTFY_URL } from '$app/env/public';
	import { invalidateAll } from '$app/navigation';
	import ColorPicker from '#lib/components/ColorPicker.svelte';
	import LabelPositionPicker from '#lib/components/LabelPositionPicker.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import UserAdmin from '#lib/components/UserAdmin.svelte';
	import ViewSettings from '#lib/components/ViewSettings.svelte';
	import { notify } from '#lib/notifications.svelte.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import { hasPermission } from '#lib/user.ts';
	import Button from '#lib/ui/Button.svelte';
	import { Check, Dices, KeyRound, Send, Trash2 } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { deleteLabel, getLabels, updateLabel } from '../../api/labels.remote';
	import { sendTestReminder, setNtfyTopic } from '../../api/reminders.remote';
	import { sendPasswordLink } from '../../api/users.remote';
	import type { PageProps } from './$types';

	// PROPS
	let { data }: PageProps = $props();

	// REMINDERS
	let topic = $state(untrack(() => data.user.ntfyTopic ?? ''));
	let savingTopic = $state(false);
	let testing = $state(false);
	let tested = $state(false);

	let stored = $derived(data.user.ntfyTopic ?? '');
	let subscribeUrl = $derived(PUBLIC_NTFY_URL && stored ? `${PUBLIC_NTFY_URL.replace(/\/$/, '')}/${stored}` : null);

	// Long and random, the topic name is the only thing that keeps strangers out on an open ntfy server
	function randomTopic() {
		const bytes = crypto.getRandomValues(new Uint8Array(12));
		topic = 'notifica-' + Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 20);
	}

	async function saveTopic() {
		savingTopic = true;
		if (await safeAction(setNtfyTopic(topic.trim()))) await invalidateAll();
		savingTopic = false;
	}

	async function test() {
		testing = true;
		tested = !!(await safeAction(sendTestReminder()));
		testing = false;
	}

	// LABELS
	let labels = $derived(await getLabels());
	let confirmDelete = $state<string | null>(null);

	$effect(() => onCollectionChange('labels', () => getLabels().refresh()));

	function rename(id: string, input: HTMLInputElement, current: string) {
		const name = input.value.trim();
		if (!name || name === current) {
			input.value = current;
			return;
		}
		safeAction(updateLabel({ id, name })).then((result) => {
			if (!result) input.value = current;
		});
	}

	async function remove(id: string) {
		if (confirmDelete !== id) {
			confirmDelete = id;
			return;
		}
		await safeAction(deleteLabel(id));
		confirmDelete = null;
	}

	// TABS | one section at a time, or every section like a long page
	const TABS = [
		{ id: 'all', label: 'All Settings' },
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'views', label: 'Views' },
		{ id: 'behaviour', label: 'Behaviour' },
		{ id: 'account', label: 'Account' },
		{ id: 'users', label: 'Users', admin: true }
	] as const;

	type Tab = (typeof TABS)[number]['id'];
	let tab = $state<Tab>('all');
	let tabs = $derived(TABS.filter((item) => !('admin' in item) || hasPermission(data.user, 'admin')));

	const shown = (id: Tab) => tab === 'all' || tab === id;

	// ACCOUNT | the same mail an invite sends, valid for 7 days
	let sendingLink = $state(false);

	async function sendLink() {
		sendingLink = true;
		if (await safeAction(sendPasswordLink(data.user.id))) notify(`Link sent to ${data.user.email}.`);
		sendingLink = false;
	}
</script>

<svelte:head>
	<title>Settings · notifica-ex</title>
</svelte:head>

<div class="mx-auto w-full max-w-content">

<PageHeader eyebrow="Preferences" title="Settings" />

<div class="layout">

<!-- TABS | a column on wide screens, a scrolling row on phones -->
<div class="tabs" role="tablist" aria-label="Settings sections">
	{#each tabs as item (item.id)}
		<button role="tab" class={['tab', tab === item.id && 'active']} aria-selected={tab === item.id} onclick={() => (tab = item.id)}>{item.label}</button>
	{/each}
</div>

<div class="grid min-w-0">

	<!-- APPEARANCE -->
	{#if shown('appearance')}
	<section class="section">
		<header>
			<h2 class="type-title text-2xl text-ink">Appearance</h2>
			<p class="mt-2 text-ink-muted">Stored on this device, so every device can have its own.</p>
		</header>
		<div class="grid gap-10">
			<div>
				<h3 class="type-meta mb-4 text-ink-faint">Theme</h3>
				<ThemePicker current={data.theme} />
			</div>
			<div>
				<h3 class="type-meta mb-1 text-ink-faint">Label tabs</h3>
				<p class="mb-6 text-ink-muted">Which edge of a note its labels hang from.</p>
				<LabelPositionPicker current={data.labelPosition} />
			</div>
		</div>
	</section>
	{/if}

	<!-- VIEWS -->
	{#if shown('views')}
	<section class="section">
		<header>
			<h2 class="type-title text-2xl text-ink">Views</h2>
			<p class="mt-2 text-ink-muted">Each view is a saved filter with its own place in the rail. The first one opens on start.</p>
		</header>
		<div class="max-w-3xl">
			<ViewSettings {labels} />
		</div>
	</section>
	{/if}

	<!-- BEHAVIOUR -->
	{#if shown('behaviour')}
	<section class="section">
		<header>
			<h2 class="type-title text-2xl text-ink">Behaviour</h2>
			<p class="mt-2 text-ink-muted">Where reminders go and how notes get sorted.</p>
		</header>
		<div class="grid max-w-xl gap-12">
			<!-- REMINDERS -->
			<div>
				<h3 class="type-meta mb-1 text-ink-faint">Reminders</h3>
				<p class="mb-6 text-ink-muted">Reminders get pushed to this ntfy topic. Subscribe to it in the ntfy app on every device that should ring.</p>

				<form class="flex flex-wrap gap-2" onsubmit={(event) => { event.preventDefault(); saveTopic(); }}>
					<input bind:value={topic} placeholder="Topic" aria-label="ntfy topic" class="field min-w-0 flex-1" />
					<Button type="button" style="ghost" icon={Dices} onclick={randomTopic}>Random</Button>
					<Button type="submit" icon={Check} loading={savingTopic} disabled={topic.trim() === stored}>Save</Button>
				</form>

				{#if stored}
					<div class="mt-4 flex flex-wrap items-center gap-3">
						<Button style="secondary" icon={Send} loading={testing} onclick={test}>Send a test</Button>
						{#if tested}<span class="text-secondary">Sent, check your phone.</span>{/if}
					</div>
					{#if subscribeUrl}
						<p class="mt-4 text-ink-muted">Subscribe address <code class="rounded bg-line px-1.5 py-0.5 text-ink break-all">{subscribeUrl}</code></p>
					{/if}
				{/if}
			</div>

			<!-- LABELS -->
			<div>
				<h3 class="type-meta mb-1 text-ink-faint">Labels</h3>
				<p class="mb-6 text-ink-muted">Rename a label by editing it, its color shows as a tab on every note. Deleting one keeps its notes.</p>

				{#if labels.length}
					<ul class="grid gap-px overflow-hidden rounded-card border border-line bg-line">
						{#each labels as label (label.id)}
							<li class="flex items-center gap-3 bg-card py-2 pr-2 pl-card">
								<ColorPicker value={label.color} onpick={(color) => safeAction(updateLabel({ id: label.id, color }))} label={`Color of ${label.name}`} />
								<input
									value={label.name}
									aria-label={`Rename ${label.name}`}
									class="min-w-0 flex-1 bg-transparent py-1.5 text-ink outline-none"
									onchange={(event) => rename(label.id, event.currentTarget, label.name)}
									onkeydown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
								/>
								<button
									class={['icon-button', confirmDelete === label.id && 'bg-accent text-on-accent hover:text-on-accent']}
									aria-label={confirmDelete === label.id ? `Confirm deleting ${label.name}` : `Delete ${label.name}`}
									onclick={() => remove(label.id)}
									onblur={() => (confirmDelete = null)}
								>
									<Trash2 class="size-4" />
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-ink-faint">No labels yet. Add them right in a note.</p>
				{/if}
			</div>
		</div>
	</section>
	{/if}

	<!-- ACCOUNT -->
	{#if shown('account')}
	<section class="section">
		<header>
			<h2 class="type-title text-2xl text-ink">Account</h2>
			<p class="mt-2 text-ink-muted">How you log in on this server.</p>
		</header>
		<div class="max-w-xl">
			<dl class="grid gap-px overflow-hidden rounded-card border border-line bg-line">
				<div class="flex items-baseline justify-between gap-4 bg-card px-card py-4">
					<dt class="text-ink-muted">Name</dt>
					<dd class="type-title text-ink">{data.user.name || '–'}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-4 bg-card px-card py-4">
					<dt class="text-ink-muted">Email</dt>
					<dd class="truncate text-ink">{data.user.email}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-4 bg-card px-card py-4">
					<dt class="text-ink-muted">Role</dt>
					<dd class="type-meta rounded-full bg-secondary-soft px-2.5 py-1 text-secondary">{data.user.authorizationLevel}</dd>
				</div>
				<div class="flex items-center justify-between gap-4 bg-card py-3 pr-3 pl-card">
					<span class="text-ink-muted">Password</span>
					<Button style="ghost" icon={KeyRound} loading={sendingLink} onclick={sendLink}>Mail me a new link</Button>
				</div>
			</dl>
		</div>
	</section>
	{/if}

	<!-- USERS -->
	{#if hasPermission(data.user, 'admin') && shown('users')}
		<section class="section">
			<header>
				<h2 class="type-title text-2xl text-ink">Users</h2>
				<p class="mt-2 text-ink-muted">Everyone with access to this server.</p>
			</header>
			<div class="max-w-3xl">
				<UserAdmin userId={data.user.id} />
			</div>
		</section>
	{/if}

</div>

</div>

</div>

<style>
	/* TABS */
	.layout {
		display: grid;
		gap: 2rem;
	}

	@media (width >= 64rem) {
		.layout {
			grid-template-columns: 11rem minmax(0, 1fr);
			gap: 3rem;
			align-items: start;
		}
	}

	.tabs {
		display: flex;
		gap: 0.25rem;
		margin-inline: calc(var(--layout-gutter) * -1);
		padding-inline: var(--layout-gutter);
		overflow-x: auto;
		scrollbar-width: none;
	}

	@media (width >= 64rem) {
		.tabs {
			position: sticky;
			top: 3rem;
			flex-direction: column;
			margin-inline: 0;
			padding-inline: 0;
		}
	}

	.tab {
		padding: 0.5rem 0.875rem;
		border-radius: var(--layout-radius-control);
		color: var(--theme-ink-muted);
		text-align: left;
		white-space: nowrap;
		transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
	}

	.tab:hover {
		color: var(--theme-ink);
		background: var(--theme-line);
	}

	.tab.active {
		color: var(--theme-on-accent);
		background: var(--theme-accent);
	}

	/* SECTIONS | heading beside the content once there is room, a hairline between them */
	.section {
		display: grid;
		gap: 1.5rem;
		padding-block: 3rem;
		border-top: 1px solid var(--theme-line);
	}

	.section:first-child {
		padding-top: 0;
		border-top: none;
	}

	@media (width >= 64rem) {
		.section {
			grid-template-columns: 14rem minmax(0, 1fr);
			gap: 3rem;
		}
	}

	.field {
		height: 2.75rem;
		padding-inline: 0.875rem;
		border: 1px solid var(--theme-line);
		border-radius: var(--layout-radius-control);
		background: var(--theme-card);
		color: var(--theme-ink);
		transition: border-color var(--duration-fast) var(--ease-out);
	}

	.field:hover {
		border-color: var(--theme-line-strong);
	}

	.field:focus {
		border-color: var(--theme-accent);
		outline: none;
	}
</style>
