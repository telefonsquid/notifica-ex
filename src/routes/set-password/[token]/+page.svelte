<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { notify } from '#lib/notifications.svelte.ts';
	import { cssEasing, duration, rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import Backdrop from '#lib/ui/Backdrop.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Input from '#lib/ui/Input.svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import { ArrowRight } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { setPassword } from '../../api/users.remote';

	// FORM STATE
	let password = $state('');
	let passwordConfirm = $state('');
	let submitting = $state(false);
	let form = $state<HTMLFormElement>();

	// ENTRANCE | intros only play for elements added after hydration
	let mounted = $state(false);
	onMount(() => { mounted = true; });

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;

		const done = await safeAction(setPassword({ token: page.params.token ?? '', password, passwordConfirm }));
		if (done) {
			notify('Password set. You can log in now.');
			await goto(resolve('/login'));
		} else {
			form?.animate(
				{ translate: ['0', '-10px', '8px', '-5px', '3px', '0'] },
				{ duration: duration('slow'), easing: cssEasing('out') }
			);
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Set password · notifica-ex</title>
</svelte:head>

<Backdrop />

<main class="relative grid min-h-dvh place-items-center px-gutter py-12">
	{#if mounted}
		<div class="w-full max-w-sm">

			<!-- BRAND -->
			<div in:rise={{ delay: stagger(0, 70) }}>
				<Logo wordmark class="mb-14" />
			</div>

			<!-- HEADLINE -->
			<h1 class="type-display mb-3 text-5xl text-ink" in:rise={{ delay: stagger(1, 70) }}>
				Pick a<br />password.
			</h1>
			<p class="mb-10 text-ink-muted" in:rise={{ delay: stagger(2, 70) }}>
				At least 8 characters. You log in with it and your email from then on.
			</p>

			<!-- FORM -->
			<form bind:this={form} class="grid gap-3" onsubmit={submit}>
				<div in:rise={{ delay: stagger(3, 70) }}>
					<Input id="password" label="New password" type="password" autocomplete="new-password" minlength={8} required bind:value={password} />
				</div>
				<div in:rise={{ delay: stagger(4, 70) }}>
					<Input id="password-confirm" label="Repeat password" type="password" autocomplete="new-password" required bind:value={passwordConfirm} />
				</div>
				<div class="mt-4" in:rise={{ delay: stagger(5, 70) }}>
					<Button type="submit" class="w-full" loading={submitting}>
						Set password
						<ArrowRight class="arrow size-4" />
					</Button>
				</div>
			</form>

		</div>
	{/if}
</main>

<style>
	/* Arrow nudges forward when the button is hovered */
	form :global(.arrow) {
		transition: translate var(--duration-base) var(--ease-spring);
	}

	form :global(button:hover .arrow) {
		translate: 3px 0;
	}
</style>
