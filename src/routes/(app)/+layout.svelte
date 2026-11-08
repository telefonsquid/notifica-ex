<script lang="ts">
    import { browser } from '$app/env'
    import { goto, invalidateAll } from '$app/navigation'
    import { resolve } from '$app/paths'
    import { page } from '$app/state'
    import { onAndroidEvent } from '#lib/android.ts';
    import { hasShare } from '#lib/android_share.ts';
    import ReminderHistory from '#lib/components/ReminderHistory.svelte'
    import Rail from '#lib/components/Rail.svelte'
    import { followAppPause, startDeviceNotifications } from '#lib/device_notifications.ts'
    import { safeAction } from '#lib/safe_action.ts';
    import { connectRealtime, onRecordChange } from '#lib/realtime.ts'
    import { onDestroy, onMount } from 'svelte'
    import type { LayoutProps } from './$types';

    // PROPS
    let { data, children }: LayoutProps = $props();

    // REALTIME CONNECTION | set up during init, child pages subscribe as soon as they mount
    if (browser && data.realtimeToken) onDestroy(connectRealtime(data.realtimeToken));

    // DEVICE NOTIFICATIONS | the Android app gets its stream address, a renewed browser subscription gets told
    onMount(() => { safeAction(startDeviceNotifications(data.user.id)); });
    $effect(() => followAppPause(!!data.user.appPaused));

    // SHARED FROM ANOTHER APP | only the notes page takes it
    function followShare() {
        if (hasShare() && page.route.id !== '/(app)/[[view]]') goto(resolve('/(app)/[[view]]', {}))
    }

    onMount(() => {
        followShare()
        return onAndroidEvent(followShare)
    })

    // OWN ACCOUNT | name, role or deactivation changed elsewhere shows up here at once
    $effect(() => {
        return onRecordChange('users', () => invalidateAll(), data.user.id)
    })
</script>

<!-- NAVIGATION -->
<Rail />

<!-- CONTENT -->
<div class="sm:pl-rail">
    <main class="page vt-page flex min-h-dvh flex-col px-gutter">
        {@render children()}
    </main>
</div>

<!-- GLOBAL DIALOGS -->
<ReminderHistory />

<style>
    /* The settings page fills exactly what this padding leaves of the window */
    .page {
        --page-top: calc(2.5rem + env(safe-area-inset-top));
        --page-bottom: calc(var(--layout-bottom-clear) + 1rem);
        padding-top: var(--page-top);
        padding-bottom: var(--page-bottom);
    }

    @media (width >= 40rem) {
        .page {
            --page-top: calc(3rem + env(safe-area-inset-top));
            --page-bottom: 3rem;
        }
    }
</style>
