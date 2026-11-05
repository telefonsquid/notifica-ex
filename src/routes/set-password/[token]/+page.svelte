<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AuthPage from '#lib/components/AuthPage.svelte';
	import { notify } from '#lib/notifications.svelte.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import Input from '#lib/ui/Input.svelte';
	import { setPassword } from '../../api/users.remote';

	let password = $state('');
	let passwordConfirm = $state('');

	async function submit() {
		if (!(await safeAction(setPassword({ token: page.params.token ?? '', password, passwordConfirm })))) return false;
		notify('Password set. You can log in now.');
		await goto(resolve('/login'));
		return true;
	}
</script>

<AuthPage title="Set password" action="Set password" onsubmit={submit}>
	<Input id="password" label="New password, at least 8 characters" type="password" autocomplete="new-password" minlength={8} required bind:value={password} />
	<Input id="password-confirm" label="Repeat password" type="password" autocomplete="new-password" required bind:value={passwordConfirm} />
</AuthPage>
