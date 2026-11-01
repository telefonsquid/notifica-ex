<script lang="ts">
    import { Check } from '@lucide/svelte';
    import type { HTMLButtonAttributes } from 'svelte/elements';

    // PROPS
    let {
        icon: Icon = Check,
        label = 'Done',
        count = 0,
        pulse = false,
        class: className,
        ...rest
    }: HTMLButtonAttributes & {
        icon?: typeof Check
        label?: string
        count?: number              // more than one shows as a badge
        pulse?: boolean             // a ring keeps leaving it while something waits
    } = $props()
</script>

<!-- The one Done pill, on the card and in the history alike -->
<button type="button" class={['done type-meta motion-interactive relative flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-on-accent hover:brightness-110 disabled:opacity-60', pulse && 'pulse', className]} {...rest}>
    <Icon class="size-3" /> {label}
    {#if count > 1}
        <span class="badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>
    {/if}
</button>

<style>
    /* PULSE | a ring keeps leaving the button while something waits to be checked off */
    .pulse::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        animation: pulse 2.4s var(--ease-out) infinite;
        pointer-events: none;
    }

    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--theme-accent) 55%, transparent); }
        70%, 100% { box-shadow: 0 0 0 0.625rem transparent; }
    }

    @media (prefers-reduced-motion: reduce) {
        .pulse::before { animation: none; }
    }

    /* Type meta spacing trails after the last digit, so the badge drops it to sit centred */
    .badge {
        display: grid;
        place-items: center;
        min-width: 1.125rem;
        height: 1.125rem;
        margin-right: -0.375rem;
        padding: 0 0.3125rem;
        border-radius: 999px;
        background: var(--theme-on-accent);
        color: var(--theme-accent);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0;
    }
</style>
