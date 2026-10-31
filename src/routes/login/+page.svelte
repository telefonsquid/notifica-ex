<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { cssEasing, duration, rise, stagger } from '#lib/motion.ts';
	import { safeAction } from '#lib/pocketbase.ts';
	import Backdrop from '#lib/ui/Backdrop.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Input from '#lib/ui/Input.svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import { ArrowRight } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { loginUser } from '../api/auth.remote';

	// FORM STATE
	let email = $state('');
	let password = $state('');
	let submitting = $state(false);
	let form = $state<HTMLFormElement>();

	// ENTRANCE | intros only play for elements added after hydration
	let mounted = $state(false);
	onMount(() => { mounted = true; });

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;

		const user = await safeAction(loginUser({ email, password }));
		if (user) {
			await goto(resolve('/(app)'), { refreshAll: true });
		} else {
			shake();
			submitting = false;
		}
	}

	// WRONG LOGIN | a short headshake instead of only a red toast
	function shake() {
		form?.animate(
			{ translate: ['0', '-10px', '8px', '-5px', '3px', '0'] },
			{ duration: duration('slow'), easing: cssEasing('out') }
		);
	}
</script>

<svelte:head>
	<title>Login · notifica-ex</title>
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
				Welcome<br />back.
			</h1>
			<p class="mb-10 text-ink-muted" in:rise={{ delay: stagger(2, 70) }}>
				Log in to pick up where you left off.
			</p>

			<!-- FORM -->
			<form bind:this={form} class="grid gap-3" onsubmit={submit}>
				<div in:rise={{ delay: stagger(3, 70) }}>
					<Input id="email" label="Email" type="email" autocomplete="email" required bind:value={email} />
				</div>
				<div in:rise={{ delay: stagger(4, 70) }}>
					<Input id="password" label="Password" type="password" autocomplete="current-password" required bind:value={password} />
				</div>
				<div class="mt-4" in:rise={{ delay: stagger(5, 70) }}>
					<Button type="submit" class="w-full" loading={submitting}>
						Log in
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
