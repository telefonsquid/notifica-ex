<script lang="ts">
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let {
        wordmark = false,
        class: className = ''
    }: {
        wordmark?: boolean
        class?: ClassValue
    } = $props()
</script>

<span class={['logo inline-flex items-center gap-3', className]}>
    <svg class="mark size-10 shrink-0" viewBox="0 0 40 40" aria-hidden="true">
        <rect class="sheet back" x="9" y="5" width="24" height="28" rx="7" />
        <rect class="sheet front" x="6" y="8" width="24" height="28" rx="7" />
        <path class="letter" d="M13 29V15l10 14V15" />
    </svg>
    {#if wordmark}
        <span class="type-display text-2xl text-ink">notifica<span class="text-accent">·ex</span></span>
    {:else}
        <span class="sr-only">notifica-ex</span>
    {/if}
</span>

<style>
    .sheet {
        transition: translate var(--duration-slow) var(--ease-spring), rotate var(--duration-slow) var(--ease-spring);
        transform-box: fill-box;
        transform-origin: center;
    }

    .back { fill: var(--theme-secondary); }
    .front { fill: var(--theme-accent); }

    .letter {
        fill: none;
        stroke: var(--theme-on-accent);
        stroke-width: 3.2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    /* Sheets fan apart like a note being pulled off the stack */
    .logo:hover .back { translate: 2px -1px; rotate: 8deg; }
    .logo:hover .front { rotate: -4deg; }
</style>
