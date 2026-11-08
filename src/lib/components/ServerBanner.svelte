<script lang="ts">
    import { page } from '$app/state';
    import { rise, sink } from '#lib/motion.ts';
    import { serverStatus, watchServer } from '#lib/singletons/server_status.svelte.ts';
    import { CloudOff } from '@lucide/svelte';
    import { onMount } from 'svelte';

    onMount(watchServer)

    // The error page already says it in big letters
    const show = $derived(serverStatus.down && page.status !== 503)
</script>

{#if show}
    <div class="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex justify-center px-4" role="status">
        <p class="flex items-center gap-2.5 rounded-full border border-line bg-raised px-4 py-2 text-sm text-ink shadow-2xl shadow-black/25" in:rise={{ y: -12 }} out:sink={{ y: -12 }}>
            <CloudOff class="size-4 shrink-0 text-accent" />
            {navigator.onLine ? 'The server is down' : 'You are offline'}, nothing can be saved right now
        </p>
    </div>
{/if}
