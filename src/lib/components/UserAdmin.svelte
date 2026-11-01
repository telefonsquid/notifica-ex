<script lang="ts">
	import { notify } from '#lib/notifications.svelte.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import { onCollectionChange } from '#lib/realtime.ts';
	import { LIMITS } from '#lib/schema_limits.ts';
	import type { AuthorizationLevel, UserSummary } from '#lib/schemas.ts';
	import { tip } from '#lib/tooltip.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import InlineInput from '#lib/ui/InlineInput.svelte';
	import Input from '#lib/ui/Input.svelte';
	import { KeyRound, RotateCcw, Send, UserX } from '@lucide/svelte';
	import { getUsers, inviteUser, sendPasswordLink, setUserState, updateUser } from '../../routes/api/users.remote';

	// PROPS
	let { userId }: { userId: string } = $props();   // the acting admin, locked against changing their own role

	// DATA
	let users = $derived(await getUsers());
	let active = $derived(users.filter((user) => user.state === 'active'));
	let inactive = $derived(users.filter((user) => user.state === 'inactive'));

	$effect(() => onCollectionChange('users', () => getUsers().refresh()));

	const ROLES: { value: AuthorizationLevel; label: string }[] = [
		{ value: 'user', label: 'User' },
		{ value: 'admin', label: 'Admin' }
	];

	// INVITE
	let name = $state('');
	let email = $state('');
	let role = $state<AuthorizationLevel>('user');
	let inviting = $state(false);

	async function invite() {
		inviting = true;
		const user = await safeAction(inviteUser({ name, email, authorizationLevel: role }));
		if (user) {
			notify(`Invite sent to ${user.email}.`);
			name = '';
			email = '';
			role = 'user';
		}
		inviting = false;
	}

	// EDITING | fields save when they lose focus, a rejected value snaps back
	function edit(user: UserSummary, field: 'name' | 'email', value: string) {
		const { id, name, email, authorizationLevel } = user;
		return safeAction(updateUser({ id, name, email, authorizationLevel, [field]: value }));
	}

	function changeRole(user: UserSummary, authorizationLevel: AuthorizationLevel) {
		if (authorizationLevel === user.authorizationLevel) return;
		const { id, name, email } = user;
		safeAction(updateUser({ id, name, email, authorizationLevel }));
	}

	async function sendLink(user: UserSummary) {
		if (await safeAction(sendPasswordLink(user.id))) notify(`Password link sent to ${user.email}.`);
	}

	// DEACTIVATE | first click arms the button, the second one goes through
	let confirmDeactivate = $state<string | null>(null);

	async function deactivate(user: UserSummary) {
		if (confirmDeactivate !== user.id) {
			confirmDeactivate = user.id;
			return;
		}
		await safeAction(setUserState({ id: user.id, state: 'inactive' }));
		confirmDeactivate = null;
	}
</script>

{#snippet roles(current: AuthorizationLevel, onpick: (role: AuthorizationLevel) => void, locked = false)}
	<div class="flex items-center gap-1 rounded-control bg-line p-1" role="group" aria-label="Role">
		{#each ROLES as option (option.value)}
			<button
				type="button"
				class={['type-meta motion-interactive rounded-[calc(var(--layout-radius-control)-0.25rem)] px-3 py-1.5 disabled:pointer-events-none', current === option.value ? 'bg-raised text-ink' : 'text-ink-faint hover:text-ink-muted', locked && current !== option.value && 'opacity-40']}
				aria-pressed={current === option.value}
				disabled={locked}
				onclick={() => onpick(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
{/snippet}

<!-- Admin only part of the settings page, sits under its Users heading -->
<div class="grid gap-10">

	<!-- INVITE -->
	<div class="max-w-xl">
		<h3 class="type-meta mb-1 text-ink-faint">Invite</h3>
		<p class="mb-6 text-ink-muted">New users get a mail with a link to set their password. It stays valid for 7 days, and you can send a new one any time.</p>

		<form class="grid gap-3" onsubmit={(event) => { event.preventDefault(); invite(); }}>
			<Input id="invite-name" label="Name" autocomplete="off" required bind:value={name} />
			<Input id="invite-email" label="Email" type="email" autocomplete="off" required bind:value={email} />
			<div class="mt-1 flex flex-wrap items-center justify-between gap-3">
				{@render roles(role, (value) => (role = value))}
				<Button type="submit" icon={Send} loading={inviting}>Send invite</Button>
			</div>
		</form>
	</div>

	<!-- ACTIVE USERS -->
	<div>
		<p class="mb-4 text-ink-muted">Edit a name or email right in place. Deactivated users get logged out everywhere and keep their notes.</p>

		<ul class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
			{#each active as user (user.id)}
				{@const self = user.id === userId}
				<li class="flex flex-wrap items-center gap-x-4 gap-y-2 bg-card py-3 pr-2 pl-card">
					<div class="grid min-w-48 flex-1">
						<InlineInput value={user.name} label={`Name of ${user.name}`} maxlength={LIMITS.USER_NAME} class="type-title text-ink" onsave={(value) => edit(user, 'name', value)} />
						<InlineInput value={user.email} label={`Email of ${user.name}`} type="email" maxlength={LIMITS.USER_EMAIL} class="text-sm text-ink-muted" onsave={(value) => edit(user, 'email', value)} />
					</div>

					{@render roles(user.authorizationLevel, (value) => changeRole(user, value), self)}

					<div class="flex items-center gap-1">
						<button class="icon-button" aria-label={`Send ${user.name} a password link`} onclick={() => sendLink(user)} {@attach tip('Send a link to set a new password')}>
							<KeyRound class="size-4" />
						</button>
						{#if self}
							<span class="type-meta w-9 text-center text-ink-faint">You</span>
						{:else}
							<button
								class={['icon-button', confirmDeactivate === user.id && 'bg-accent text-on-accent hover:text-on-accent']}
								aria-label={confirmDeactivate === user.id ? `Confirm deactivating ${user.name}` : `Deactivate ${user.name}`}
								{@attach tip(confirmDeactivate === user.id ? 'Click again to deactivate' : 'Deactivate, signs them out everywhere')}
								onclick={() => deactivate(user)}
								onblur={() => (confirmDeactivate = null)}
							>
								<UserX class="size-4" />
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</div>

	<!-- DEACTIVATED USERS -->
	{#if inactive.length}
		<div>
			<h3 class="type-meta mb-4 text-ink-faint">Deactivated</h3>
			<ul class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
				{#each inactive as user (user.id)}
					<li class="flex items-center gap-4 bg-card py-3 pr-2 pl-card">
						<div class="grid min-w-0 flex-1">
							<span class="type-title truncate text-ink-muted">{user.name}</span>
							<span class="truncate text-sm text-ink-faint">{user.email}</span>
						</div>
						<Button style="ghost" icon={RotateCcw} onclick={() => safeAction(setUserState({ id: user.id, state: 'active' }))}>Reactivate</Button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

</div>
