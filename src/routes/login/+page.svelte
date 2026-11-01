<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AuthPage from '#lib/components/AuthPage.svelte';
	import { safeAction } from '#lib/pocketbase.ts';
	import Input from '#lib/ui/Input.svelte';
	import { loginUser } from '../api/auth.remote';

	let email = $state('');
	let password = $state('');

	async function login() {
		if (!(await safeAction(loginUser({ email, password })))) return false;
		await goto(resolve('/(app)/[[view]]', {}), { refreshAll: true });
		return true;
	}
</script>

{#snippet headline()}Welcome<br />back.{/snippet}

{#snippet emailField()}
	<Input id="email" label="Email" type="email" autocomplete="email" required bind:value={email} />
{/snippet}

{#snippet passwordField()}
	<Input id="password" label="Password" type="password" autocomplete="current-password" required bind:value={password} />
{/snippet}

<AuthPage title="Login" {headline} intro="Log in to pick up where you left off." fields={[emailField, passwordField]} action="Log in" onsubmit={login} />
