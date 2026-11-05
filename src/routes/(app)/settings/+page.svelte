<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import ColorPicker from '#lib/components/ColorPicker.svelte';
	import ImageFitPicker from '#lib/components/ImageFitPicker.svelte';
	import LabelPositionPicker from '#lib/components/LabelPositionPicker.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import SettingsSection from '#lib/components/SettingsSection.svelte';
	import ThemePicker from '#lib/components/ThemePicker.svelte';
	import UserAdmin from '#lib/components/UserAdmin.svelte';
	import ViewSettings from '#lib/components/ViewSettings.svelte';
	import { deleteLabelEverywhere } from '#lib/deletions.ts';
	import { notify } from '#lib/notifications.svelte.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import { LIMITS } from '#lib/schema_limits.ts';
	import { tip } from '#lib/tooltip.svelte.ts';
	import { hasPermission } from '#lib/user.ts';
	import Button from '#lib/ui/Button.svelte';
	import InlineInput from '#lib/ui/InlineInput.svelte';
	import { Bell, Check, CircleUserRound, KeyRound, Palette, PanelsTopLeft, Tag, Trash2, Users } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { unfold } from '#lib/motion.ts';
	import { getLabels, updateLabel } from '../../api/labels.remote';
	import { sendPasswordLink, updateProfile } from '../../api/users.remote';
	import type { PageProps } from './$types';

	// PROPS
	let { data }: PageProps = $props();

	// LABELS
	let labels = $derived(await getLabels());

	$effect(() => onCollectionChange('labels', () => getLabels().refresh()));

	// SECTIONS | one long scroll that snaps to a section, the one at the top is current
	const SECTIONS = [
		{ id: 'appearance', label: 'Appearance', icon: Palette },
		{ id: 'views', label: 'Views', icon: PanelsTopLeft },
		{ id: 'labels', label: 'Labels', icon: Tag },
		{ id: 'notifications', label: 'Notifications', icon: Bell },
		{ id: 'account', label: 'Account', icon: CircleUserRound },
		{ id: 'users', label: 'Users', icon: Users, admin: true }
	] as const;

	type Tab = (typeof SECTIONS)[number]['id'];
	let tab = $state<Tab>('appearance');
	let sections = $derived(SECTIONS.filter((item) => !('admin' in item) || hasPermission(data.user, 'admin')));

	let tablist = $state<HTMLElement>();
	let stage = $state<HTMLElement>();
	let indicator = $state({ x: 0, y: 0, width: 0, height: 0 });
	let ready = $state(false);
	let jumping = false; // A tab click scrolls past other sections, they shouldn't light up on the way
	let landing: ReturnType<typeof setTimeout> | undefined;

	function place() {
		const button = tablist?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
		if (!button) return;

		indicator = { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight };
	}

	$effect(() => {
		void tab;
		place();
	});

	$effect(() => {
		if (!tablist) return;
		const observer = new ResizeObserver(place);
		observer.observe(tablist);
		requestAnimationFrame(() => (ready = true)); // The first placement shows at once
		return () => observer.disconnect();
	});

	// Where a settled section's top sits on screen
	function snapLine(stage: HTMLElement) {
		return stage.getBoundingClientRect().top + (parseFloat(getComputedStyle(stage).scrollPaddingTop) || 0);
	}

	function go(id: Tab) {
		const section = stage?.querySelector<HTMLElement>(`[data-section="${id}"]`);
		if (!stage || !section) return;

		tab = id;
		jumping = true;
		clearTimeout(landing);
		landing = setTimeout(() => (jumping = false), 1000); // In case scrollend never fires

		const top = stage.scrollTop + section.getBoundingClientRect().top - snapLine(stage);
		stage.scrollTo({ top, behavior: 'smooth' });
	}

	// What every stop of the scroll hands its section
	function stop(id: Tab) {
		return { id, title: SECTIONS.find((item) => item.id === id)?.label ?? id, current: tab === id, onselect: () => go(id) };
	}

	// The rail's Edit view lands here with ?view=<id> and opens that view's filters
	let editing = $state<string | null>(null);

	$effect(() => {
		const id = page.url.searchParams.get('view');
		if (!id || !stage) return;
		editing = id;
		requestAnimationFrame(() => go('views'));
	});

	// The last section whose top reached the snap line, with some slack for a scroll that isn't done yet
	function follow() {
		if (jumping || !stage) return;

		const line = snapLine(stage) + 48;
		let current = sections[0].id as Tab;
		for (const item of sections) {
			const section = stage.querySelector<HTMLElement>(`[data-section="${item.id}"]`);
			if (section && section.getBoundingClientRect().top <= line) current = item.id;
		}
		tab = current;
	}

	function land() {
		jumping = false;
		clearTimeout(landing);
	}

	// Arrow keys walk the tabs and move focus along
	function step(event: KeyboardEvent) {
		const delta = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[event.key];
		if (!delta) return;
		event.preventDefault();

		const index = sections.findIndex((item) => item.id === tab);
		const next = sections[Math.min(Math.max(index + delta, 0), sections.length - 1)];
		go(next.id);
		tablist?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
	}

	// ACCOUNT
	let name = $state(untrack(() => data.user.name ?? ''));
	let email = $state(untrack(() => data.user.email));
	let savingProfile = $state(false);
	let profileChanged = $derived(name.trim() !== (data.user.name ?? '') || email.trim().toLowerCase() !== data.user.email);

	async function saveProfile() {
		savingProfile = true;
		if (await safeAction(updateProfile({ name, email }))) await invalidateAll();
		savingProfile = false;
	}

	// The same mail an invite sends, valid for 7 days
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

<!-- TABS | a column on wide screens, an even row on tablets, an icon bar in the bottom row on phones -->
<div bind:this={tablist} class={['tabs', ready && 'ready']} role="tablist" aria-label="Settings sections" tabindex="-1" onkeydown={step}>
	<span class="indicator" style:--x="{indicator.x}px" style:--y="{indicator.y}px" style:--width="{indicator.width}px" style:--height="{indicator.height}px"></span>
	{#each sections as item (item.id)}
		<button
			role="tab"
			data-tab={item.id}
			class={['tab', tab === item.id && 'active']}
			aria-selected={tab === item.id}
			aria-controls={item.id}
			tabindex={tab === item.id ? 0 : -1}
			onclick={() => go(item.id)}
		>
			<item.icon class="icon size-5 shrink-0" strokeWidth={1.75} />
			<span class="max-sm:sr-only">{item.label}</span>
		</button>
	{/each}
</div>

<!-- STAGE | scrolls on its own and snaps each section to the top, the neighbours peek in at the edges -->
<div bind:this={stage} class="stage" onscroll={follow} onscrollend={land}>
<div class="track">

	<!-- APPEARANCE -->
	<SettingsSection {...stop('appearance')}>
		<div class="grid gap-10">
			<div>
				<h3 class="type-meta mb-4 text-ink-faint">Theme</h3>
				<ThemePicker current={data.theme} />
			</div>
			<div>
				<h3 class="type-meta mb-4 text-ink-faint">Label tabs</h3>
				<LabelPositionPicker current={data.labelPosition} />
			</div>
			<div>
				<h3 class="type-meta mb-4 text-ink-faint">Images</h3>
				<ImageFitPicker current={data.imageFit} />
			</div>
		</div>
	</SettingsSection>

	<!-- VIEWS -->
	<SettingsSection {...stop('views')}>
		<ViewSettings {labels} bind:expanded={editing} />
	</SettingsSection>

	<!-- LABELS -->
	<SettingsSection {...stop('labels')}>
		{#if labels.length}
			<ul class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
				{#each labels as label (label.id)}
					<li class="flex items-center gap-3 bg-card py-2 pr-2 pl-card">
						<ColorPicker value={label.color} onpick={(color) => safeAction(updateLabel({ id: label.id, color }))} label={`Color of ${label.name}`} />
						<InlineInput value={label.name} label={`Rename ${label.name}`} maxlength={LIMITS.LABEL_NAME} class="flex-1 py-1.5 text-ink" onsave={(name) => safeAction(updateLabel({ id: label.id, name }))} />
						<button class="icon-button" aria-label={`Delete ${label.name}`} onclick={() => deleteLabelEverywhere(label)} {@attach tip('Delete label')}>
							<Trash2 class="size-4" />
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-ink-faint">No labels yet. Add them right in a note.</p>
		{/if}
	</SettingsSection>

	<!-- NOTIFICATIONS -->
	<SettingsSection {...stop('notifications')}>
		<NotificationSettings user={data.user} />
	</SettingsSection>

	<!-- ACCOUNT -->
	<SettingsSection {...stop('account')}>
		<form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); saveProfile(); }}>
			<dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
				<div class="flex items-baseline justify-between gap-4 bg-card px-card py-2.5">
					<dt><label for="profile-name" class="text-ink-muted">Name</label></dt>
					<dd class="min-w-0 flex-1"><input id="profile-name" bind:value={name} autocomplete="name" required class="type-title w-full bg-transparent py-1.5 text-right text-ink outline-none" /></dd>
				</div>
				<div class="flex items-baseline justify-between gap-4 bg-card px-card py-2.5">
					<dt><label for="profile-email" class="text-ink-muted">Email</label></dt>
					<dd class="min-w-0 flex-1"><input id="profile-email" bind:value={email} type="email" autocomplete="email" required class="w-full bg-transparent py-1.5 text-right text-ink outline-none" /></dd>
				</div>
				<div class="flex items-baseline justify-between gap-4 bg-card px-card py-4">
					<dt class="text-ink-muted">Role</dt>
					<dd class="type-meta rounded-full bg-secondary-soft px-2.5 py-1 text-secondary">{data.user.authorizationLevel}</dd>
				</div>
				<div class="flex items-center justify-between gap-4 bg-card py-3 pr-3 pl-card">
					<span class="text-ink-muted">Password</span>
					<Button type="button" style="ghost" icon={KeyRound} loading={sendingLink} onclick={sendLink}>Mail me a new link</Button>
				</div>
			</dl>
			{#if profileChanged}
				<div class="flex justify-end gap-2" transition:unfold>
					<Button type="button" style="ghost" onclick={() => { name = data.user.name ?? ''; email = data.user.email; }}>Undo</Button>
					<Button type="submit" icon={Check} loading={savingProfile}>Save</Button>
				</div>
			{/if}
		</form>
	</SettingsSection>

	<!-- USERS -->
	{#if hasPermission(data.user, 'admin')}
	<SettingsSection {...stop('users')}>
		<UserAdmin userId={data.user.id} />
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
		grid-template-rows: minmax(0, 1fr);
		height: calc(100dvh - 8.5rem - env(safe-area-inset-top));
	}

	@media (width >= 40rem) {
		.settings {
			--peek: 4rem;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 1rem;
			height: calc(100dvh - 6rem - env(safe-area-inset-top));
		}
	}

	@media (width >= 64rem) {
		.settings {
			grid-template-columns: 12rem minmax(0, 1fr);
			grid-template-rows: none;
			gap: 3rem;
		}
	}

	/* TABS | on phones they share the bottom row with the rail's menu button, at its height */
	.tabs {
		position: fixed;
		right: var(--layout-content-gutter);
		bottom: calc(1rem + env(safe-area-inset-bottom));
		left: calc(var(--layout-content-gutter) + 4.5rem);
		z-index: 30;
		display: flex;
		height: 4rem;
		padding: 0.375rem;
		border: 1px solid var(--theme-line-strong);
		border-radius: 999px;
		background: var(--theme-raised);
		outline: none;
	}

	@media (width >= 40rem) {
		.tabs {
			position: relative;
			inset: auto;
			z-index: auto;
			gap: 0.25rem;
			height: auto;
			padding: 0;
			border: 0;
			border-radius: 0;
			background: none;
		}
	}

	@media (width >= 64rem) {
		.tabs {
			flex-direction: column;
			align-self: start;
			padding-top: var(--peek);
		}
	}

	.tab {
		position: relative;
		display: flex;
		flex: 1 1 0;
		flex-direction: column;
		gap: 0.25rem;
		align-items: center;
		justify-content: center;
		min-width: 0;
		border-radius: 999px;
		color: var(--theme-ink-muted);
		transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
	}

	@media (width >= 40rem) {
		.tab {
			padding: 0.5rem 0.25rem;
			border-radius: var(--layout-radius-control);
			font-size: 0.75rem;
		}
	}

	@media (width >= 64rem) {
		.tab {
			flex: none;
			flex-direction: row;
			gap: 0.75rem;
			justify-content: start;
			padding: 0.625rem 0.875rem;
			font-size: inherit;
			text-align: left;
		}
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
		transition: scale var(--duration-base) var(--ease-spring);
	}

	.tab:hover :global(.icon),
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
		border-radius: 999px;
		background: var(--theme-accent);
		translate: var(--x) var(--y);
		opacity: 0;
	}

	@media (width >= 40rem) {
		.indicator {
			border-radius: var(--layout-radius-control);
		}
	}

	.tabs.ready .indicator {
		opacity: 1;
		transition: translate var(--duration-base) var(--ease-emphasized), width var(--duration-base) var(--ease-emphasized), height var(--duration-base) var(--ease-emphasized);
	}

	/* STAGE | the neighbours fade out towards its edges */
	.stage {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scroll-snap-type: y mandatory;
		scroll-padding-top: var(--peek);
		scrollbar-width: none;
		container-type: size;
		mask-image: linear-gradient(transparent, #000 var(--peek), #000 calc(100% - var(--peek)), transparent);
	}

	/* One column for every section, a wide row inside must not stretch them past the screen */
	.track {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.5rem;
		max-width: 48rem;
		padding-top: var(--peek);
	}
</style>
