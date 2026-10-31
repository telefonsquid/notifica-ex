<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import Toaster from '#lib/ui/Toaster.svelte';
	import '../app.css';
	import type { LayoutProps } from './$types';

	// PROPS
	let { children }: LayoutProps = $props();

	// VIEW TRANSITION | the animation itself lives in app.css
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<!-- CONTENT -->
{@render children()}

<!-- TOASTER -->
<Toaster />
