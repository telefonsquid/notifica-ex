<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Button from '#lib/ui/Button.svelte';
	import { ArrowLeft } from '@lucide/svelte';
</script>

<svelte:head>
	<title>{page.status} · notifica-ex</title>
</svelte:head>

<main class="grid min-h-dvh place-items-center px-gutter">
	<div class="max-w-md">
		<p class="type-meta mb-4 text-accent">Error {page.status}</p>
		<h1 class="type-display mb-4 text-5xl text-ink">{page.status === 404 ? 'Nothing to see here.' : 'Something broke.'}</h1>
		<p class="mb-10 text-ink-muted">{page.error?.message}</p>
		<Button href={resolve('/(app)')} style="secondary" icon={ArrowLeft}>Back to notes</Button>
	</div>
</main>
