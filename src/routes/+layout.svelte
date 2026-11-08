<script lang="ts">
    import { beforeNavigate, onNavigate } from '$app/navigation'
    import { page } from '$app/state'
    import { followPendingLink, syncStatusBar } from '#lib/android.ts';
    import { closeOverlay } from '#lib/back.ts'
    import { prefetchRoute } from '#lib/prefetch.ts'
    import type { User } from '#lib/schemas/users.ts';
    import PasswordDialog from '#lib/components/PasswordDialog.svelte'
    import ConfirmDialog from '#lib/components/ConfirmDialog.svelte'
    import ImageViewer from '#lib/components/ImageViewer.svelte'
    import NavigationProgress from '#lib/components/NavigationProgress.svelte'
    import ServerBanner from '#lib/components/ServerBanner.svelte'
    import Toaster from '#lib/components/Toaster.svelte'
    import Tooltip from '#lib/components/Tooltip.svelte'
    import { onMount } from 'svelte'
    import '../app.css'
    import type { LayoutProps } from './$types';

    // PROPS
    let { children }: LayoutProps = $props();

    // ANDROID STATUS BAR | matches the theme the server rendered
    onMount(syncStatusBar)
    onMount(followPendingLink);

    // BACK | an open overlay closes instead of the page behind it changing
    onMount(() => { window.closeOverlay = closeOverlay; })

    beforeNavigate(({ type, cancel }) => {
        if (type === 'popstate' && closeOverlay()) cancel()
    });

    // VIEW TRANSITION | the animation itself lives in app.css
    onNavigate(async (navigation) => {

        // The transition freezes the screen until the new page shows, so its data loads first while the old one still responds
        const queries = prefetchRoute(navigation.to?.route.id, page.data.user as User | undefined)
        await Promise.allSettled(queries)
        navigation.complete.then(() => queries, () => queries); // Holds them in the cache until the page picks them up

        if (!document.startViewTransition) return;

        // A page that stays mounted animates its own content, the transition only moves the shell
        const root = document.documentElement
        if (navigation.from?.route.id && navigation.from.route.id === navigation.to?.route.id) root.dataset.transition = 'same-page'

        return new Promise((resolve) => {
            const transition = document.startViewTransition(async () => {
                resolve()
                await navigation.complete
            })
            transition.ready.catch(() => {}); // A navigation right after this one skips it, nothing to report
            transition.finished.finally(() => {
                if (root.dataset.transition === 'same-page') delete root.dataset.transition
            })
        })
    })
</script>

<!-- CONTENT -->
{@render children()}

<!-- STATUS BAR | content scrolls under it in the Android app, zero high in a browser -->
<div class="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[env(safe-area-inset-top)] bg-canvas"></div>

<!-- SERVER DOWN -->
<ServerBanner />

<!-- NAVIGATION PROGRESS -->
<NavigationProgress />

<!-- TOASTER -->
<Toaster />

<!-- TOOLTIP -->
<Tooltip />

<!-- CONFIRM DIALOG -->
<ConfirmDialog />

<!-- PASSWORD DIALOG -->
<PasswordDialog />

<!-- IMAGE VIEWER -->
<ImageViewer />
