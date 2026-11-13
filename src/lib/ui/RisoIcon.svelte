<script lang="ts">
    import type { Component } from 'svelte';
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let {
        icon: Icon,
        class: className = '',
        strokeWidth = 2
    }: {
        icon: Component<{ class?: string, strokeWidth?: number }>
        class?: ClassValue
        strokeWidth?: number
    } = $props()
</script>

<!-- Printed twice like the logo | --riso-ghost hides the pink pass slipped bottom right -->
<span class={['riso-icon relative inline-grid shrink-0', className]} aria-hidden="true">
    <Icon class="ghost size-full" {strokeWidth} />
    <Icon class="ink size-full" {strokeWidth} />
</span>

<style>
    .riso-icon > :global(*) {
        grid-area: 1 / 1;
    }

    .riso-icon :global(.ghost) {
        color: var(--theme-riso-pink);
        opacity: var(--riso-ghost, 1);
        translate: 1.5px 1.25px;
        transition: translate var(--duration-base) var(--ease-spring), opacity var(--duration-fast) var(--ease-out);
    }

    /* Overprints the pink pass like the logo's inks | --riso-icon-blend turns it off on a filled ink */
    .riso-icon :global(.ink) {
        mix-blend-mode: var(--riso-icon-blend, var(--theme-riso-ink-blend));
    }
</style>
