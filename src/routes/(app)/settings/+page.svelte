<script lang="ts">
	import { PUBLIC_NTFY_URL } from '$app/env/public';
	import { invalidateAll } from '$app/navigation';
	import ColorPicker from '#lib/components/ColorPicker.svelte';
	import LabelPositionPicker from '#lib/components/LabelPositionPicker.svelte';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import UserAdmin from '#lib/components/UserAdmin.svelte';
	import ViewSettings from '#lib/components/ViewSettings.svelte';
	import { notify } from '#lib/notifications.svelte.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import { tip } from '#lib/tooltip.svelte.ts';
	import { hasPermission } from '#lib/user.ts';
	import Button from '#lib/ui/Button.svelte';
	import { Check, CircleUserRound, Dices, KeyRound, Palette, PanelsTopLeft, Send, SlidersHorizontal, Trash2, Users } from '@lucide/svelte';
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

	// SECTIONS | one at a time, the stack slides so the chosen one sits in view
	const SECTIONS = [
		{ id: 'appearance', label: 'Appearance', icon: Palette },
		{ id: 'views', label: 'Views', icon: PanelsTopLeft },
		{ id: 'behaviour', label: 'Behaviour', icon: SlidersHorizontal },
		{ id: 'account', label: 'Account', icon: CircleUserRound },
		{ id: 'users', label: 'Users', icon: Users, admin: true }
	] as const;

	type Tab = (typeof SECTIONS)[number]['id'];
	let tab = $state<Tab>('appearance');
	let sections = $derived(SECTIONS.filter((item) => !('admin' in item) || hasPermission(data.user, 'admin')));

	let tablist = $state<HTMLElement>();
	let track = $state<HTMLElement>();
	let offset = $state(0);
	let indicator = $state({ x: 0, y: 0, width: 0, height: 0 });
	let ready = $state(false);

	// Offsets instead of rects, the track and indicator measure themselves and not their running slide
	function place() {
		const section = track?.querySelector<HTMLElement>(`[data-section="${tab}"]`);
		const first = track?.firstElementChild as HTMLElement | null | undefined;
		const button = tablist?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
		if (!section || !first || !button) return;

		offset = first.offsetTop - section.offsetTop;
		indicator = { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight };
		button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: ready ? 'smooth' : 'instant' });
	}

	$effect(() => {
		void tab;
		place();
	});

	// Sections change height with their content, the slide follows
	$effect(() => {
		if (!track || !tablist) return;
		const observer = new ResizeObserver(place);
		observer.observe(track);
		observer.observe(tablist);
		requestAnimationFrame(() => (ready = true)); // The first placement shows at once
		return () => observer.disconnect();
	});

	// Arrow keys walk the tabs and move focus along
	function step(event: KeyboardEvent) {
		const delta = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[event.key];
		if (!delta) return;
		event.preventDefault();

		const index = sections.findIndex((item) => item.id === tab);
		const next = sections[Math.min(Math.max(index + delta, 0), sections.length - 1)];
		tab = next.id;
		tablist?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
	}

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

<div class="settings mx-auto w-full max-w-content">

<!-- TABS | a column on wide screens, a scrolling row on phones -->
<div bind:this={tablist} class={['tabs', ready && 'ready']} role="tablist" aria-label="Settings sections" aria-orientation="vertical" tabindex="-1" onkeydown={step}>
	<span class="indicator" style:--x="{indicator.x}px" style:--y="{indicator.y}px" style:--width="{indicator.width}px" style:--height="{indicator.height}px"></span>
	{#each sections as item (item.id)}
		<button
			role="tab"
			data-tab={item.id}
			class={['tab', tab === item.id && 'active']}
			aria-selected={tab === item.id}
			aria-controls={item.id}
			tabindex={tab === item.id ? 0 : -1}
			onclick={() => (tab = item.id)}
		>
			<item.icon class="icon size-5 shrink-0" strokeWidth={1.75} />
			{item.label}
		</button>
	{/each}
</div>

<!-- STAGE | only the current section takes the pointer and the wheel, its neighbours peek in at the edges -->
<div class="stage">
<div bind:this={track} class={['track', ready && 'ready']} style:--offset="{offset}px">

	<!-- APPEARANCE -->
	<SettingsSection id="appearance" title="Appearance" description="Stored on this device, so every device can have its own." current={tab === 'appearance'} onselect={() => (tab = 'appearance')}>
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
	</SettingsSection>

	<!-- VIEWS -->
	<SettingsSection id="views" title="Views" description="Each view is a saved filter with its own place in the rail. The first one opens on start." current={tab === 'views'} onselect={() => (tab = 'views')}>
		<div class="max-w-3xl">
			<ViewSettings {labels} />
		</div>
	</SettingsSection>

	<!-- BEHAVIOUR -->
	<SettingsSection id="behaviour" title="Behaviour" description="Where reminders go and how notes get sorted." current={tab === 'behaviour'} onselect={() => (tab = 'behaviour')}>
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
									{@attach tip(confirmDelete === label.id ? 'Click again to delete, its notes stay' : 'Delete label')}
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
	</SettingsSection>

	<!-- ACCOUNT -->
	<SettingsSection id="account" title="Account" description="How you log in on this server." current={tab === 'account'} onselect={() => (tab = 'account')}>
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
	</SettingsSection>

	<!-- USERS -->
	{#if hasPermission(data.user, 'admin')}
	<SettingsSection id="users" title="Users" description="Everyone with access to this server." current={tab === 'users'} onselect={() => (tab = 'users')}>
		<div class="max-w-3xl">
			<UserAdmin userId={data.user.id} />
		</div>
	</SettingsSection>
	{/if}

</div>

</div>

</div>

<style>
	/* LAYOUT | exactly the window minus the page padding, the stage scrolls instead of the page */
	.settings {
		--peek: 2.5rem;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 1rem;
		height: calc(100dvh - 9.5rem);
	}

	@media (width >= 40rem) {
		.settings {
			--peek: 4rem;
			height: calc(100dvh - 6rem);
		}
	}

	@media (width >= 64rem) {
		.settings {
			grid-template-columns: 12rem minmax(0, 1fr);
			grid-template-rows: none;
			gap: 3rem;
		}
	}

	/* TABS */
	.tabs {
		position: relative;
		display: flex;
		gap: 0.25rem;
		margin-inline: calc(var(--layout-gutter) * -1);
		padding-inline: var(--layout-gutter);
		overflow-x: auto;
		scrollbar-width: none;
		outline: none;
	}

	@media (width >= 64rem) {
		.tabs {
			flex-direction: column;
			align-self: start;
			margin-inline: 0;
			padding: var(--peek) 0 0;
			overflow: visible;
		}
	}

	.tab {
		position: relative;
		display: flex;
		flex-shrink: 0;
		gap: 0.75rem;
		align-items: center;
		padding: 0.625rem 0.875rem;
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

	/* Takes on the colour in step with the indicator gliding in */
	.tab.active {
		color: var(--theme-on-accent);
		background: transparent;
		transition: color var(--duration-base) var(--ease-in-out);
	}

	/* Until the indicator knows its place the tab paints itself */
	.tabs:not(.ready) .tab.active {
		background: var(--theme-accent);
	}

	.tab :global(.icon) {
		transition: rotate var(--duration-base) var(--ease-spring), scale var(--duration-base) var(--ease-spring);
	}

	.tab:hover :global(.icon) {
		rotate: -8deg;
		scale: 1.08;
	}

	.tab.active :global(.icon) {
		scale: 1.08;
	}

	.tab:active :global(.icon) {
		scale: 0.88;
	}

	.indicator {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--width);
		height: var(--height);
		border-radius: var(--layout-radius-control);
		background: var(--theme-accent);
		translate: var(--x) var(--y);
		opacity: 0;
	}

	.tabs.ready .indicator {
		opacity: 1;
		transition: translate var(--duration-base) var(--ease-emphasized), width var(--duration-base) var(--ease-emphasized), height var(--duration-base) var(--ease-emphasized);
	}

	/* STAGE | the neighbours fade out towards its edges */
	.stage {
		min-height: 0;
		overflow: clip;
		container-type: size;
		mask-image: linear-gradient(transparent, #000 var(--peek), #000 calc(100% - var(--peek)), transparent);
	}

	.track {
		position: relative;
		display: grid;
		gap: 1.5rem;
		padding-block: var(--peek);
		translate: 0 var(--offset);
	}

	.track.ready {
		transition: translate var(--duration-page) var(--ease-emphasized);
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
