<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { syncStatusBar } from '#lib/android.ts';
	import { prefetchRoute } from '#lib/prefetch.ts';
	import type { User } from '#lib/schemas.ts';
	import ConfirmDialog from '#lib/ui/ConfirmDialog.svelte';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';
	import NavigationProgress from '#lib/ui/NavigationProgress.svelte';
	import Toaster from '#lib/ui/Toaster.svelte';
	import Tooltip from '#lib/ui/Tooltip.svelte';
	import { onMount } from 'svelte';
	import '../app.css';
	import type { LayoutProps } from './$types';

	// PROPS
	let { children }: LayoutProps = $props();

	// ANDROID STATUS BAR | matches the theme the server rendered
	onMount(syncStatusBar);

	// VIEW TRANSITION | the animation itself lives in app.css
	onNavigate(async (navigation) => {

		// The transition freezes the screen until the new page shows, so its data loads first while the old one still responds
		const queries = prefetchRoute(navigation.to?.route.id, page.data.user as User | undefined);
		await Promise.allSettled(queries);
		navigation.complete.then(() => queries, () => queries); // Holds them in the cache until the page picks them up

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

<!-- STATUS BAR | content scrolls under it in the Android app, zero high in a browser -->
<div class="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[env(safe-area-inset-top)] bg-canvas"></div>

<!-- NAVIGATION PROGRESS -->
<NavigationProgress />

<!-- TOASTER -->
<Toaster />

<!-- TOOLTIP -->
<Tooltip />

<!-- CONFIRM DIALOG -->
<ConfirmDialog />

<!-- IMAGE VIEWER -->
<ImageViewer />
