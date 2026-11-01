<script lang="ts">
	import { browser } from '$app/env';
	import { invalidateAll } from '$app/navigation';
	import Rail from '#lib/components/Rail.svelte';
	import { connectRealtime, onRecordChange } from '#lib/realtime.ts';
	import { onDestroy } from 'svelte';
	import type { LayoutProps } from './$types';

	// PROPS
	let { data, children }: LayoutProps = $props();

	// REALTIME CONNECTION | set up during init, child pages subscribe as soon as they mount
	if (browser && data.realtimeToken) onDestroy(connectRealtime(data.realtimeToken));

	// OWN ACCOUNT | name, role or deactivation changed elsewhere shows up here at once
	$effect(() => {
		return onRecordChange('users', () => invalidateAll(), data.user.id);
	});
</script>

<!-- NAVIGATION -->
<Rail />

<!-- CONTENT -->
<div class="sm:pl-rail">
	<main class="vt-page flex min-h-dvh flex-col px-gutter pt-10 pb-24 sm:py-12">
		{@render children()}
	</main>
</div>
