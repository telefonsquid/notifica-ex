<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import Toaster from '#lib/ui/Toaster.svelte';
	import Tooltip from '#lib/ui/Tooltip.svelte';
	import '../app.css';
	import type { LayoutProps } from './$types';

	// PROPS
	let { children }: LayoutProps = $props();

	// VIEW TRANSITION | the animation itself lives in app.css
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		// A page that stays mounted animates its own content, the transition only moves the shell
		const root = document.documentElement;
		if (navigation.from?.route.id && navigation.from.route.id === navigation.to?.route.id) root.dataset.transition = 'same-page';

		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.ready.catch(() => {}); // A navigation right after this one skips it, nothing to report
			transition.finished.finally(() => {
				if (root.dataset.transition === 'same-page') delete root.dataset.transition;
			});
		});
	});
</script>

<!-- CONTENT -->
{@render children()}

<!-- TOASTER -->
<Toaster />

<!-- TOOLTIP -->
<Tooltip />
