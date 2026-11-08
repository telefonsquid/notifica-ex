<script lang="ts">
    import { duration, easing, rise, sink } from '#lib/motion.ts';
    import { act, dismiss, notifications } from '#lib/notifications.svelte.ts';
    import { CircleAlert, CircleCheck, Info, X } from '@lucide/svelte';
    import { flip } from 'svelte/animate';

    const icons = { success: CircleCheck, error: CircleAlert, info: Info }
</script>

<!-- Newest toast at the bottom, the others slide up to make room -->
<ol class="pointer-events-none fixed inset-x-0 bottom-[var(--layout-bottom-clear)] z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6" aria-live="polite">
    {#each notifications as notification (notification.id)}
        {@const Icon = icons[notification.type]}
        <li
            class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-line bg-raised py-3 pr-2 pl-4 text-sm text-ink shadow-2xl shadow-black/25"
            in:rise={{ y: 18, scale: 0.94 }}
            out:sink={{ y: 0, scale: 0.9 }}
            animate:flip={{ duration: duration('base'), easing: easing('out') }}
        >
            <Icon class={['mt-0.5 size-4 shrink-0', notification.type === 'error' ? 'text-accent' : 'text-secondary']} />
            <p class="flex-1 py-px whitespace-pre-line">{notification.content}</p>
            {#if notification.action}
                <button class="motion-interactive -my-1 rounded-control px-2 py-1 font-medium text-accent hover:bg-accent-soft" onclick={() => act(notification.id)}>
                    {notification.action.label}
                </button>
            {/if}
            <button
                class="motion-interactive -my-1 rounded-control p-1.5 text-ink-faint hover:bg-accent-soft hover:text-ink"
                aria-label="Dismiss"
                onclick={() => dismiss(notification.id)}
            >
                <X class="size-4" />
            </button>
        </li>
    {/each}
</ol>
