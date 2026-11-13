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

<!-- Printed twice like the logo | --riso-ghost hides the slipped pass, --riso-x and --riso-y move it -->
<span class={['riso-icon relative inline-grid shrink-0', className]} aria-hidden="true">
    <Icon class="ghost size-full" {strokeWidth} />
    <Icon class="ink size-full" {strokeWidth} />
</span>

<style>
    .riso-icon > :global(*) {
        grid-area: 1 / 1;
    }

    .riso-icon :global(.ghost) {
        color: var(--theme-riso-ghost);
        opacity: var(--riso-ghost, 1);
        translate: var(--riso-x) var(--riso-y);
        transition: translate var(--duration-base) var(--ease-spring), opacity var(--duration-fast) var(--ease-out);
    }

    /* Overprints the slipped pass, darker on paper and lighter on Charcoal */
    .riso-icon :global(.ink) {
        mix-blend-mode: var(--theme-riso-blend);
    }
</style>
