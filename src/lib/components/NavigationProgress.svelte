<script lang="ts">
    import { navigating } from '$app/state';
    import { duration, easing } from '#lib/motion.ts';
    import { busy } from '#lib/singletons/busy.svelte.ts';
    import { fade } from 'svelte/transition';

    // A thin running bar on top, only for page switches and server actions slow enough to wonder about
    const DELAY = 250

    let working = $derived(!!navigating.to || busy.actions > 0)
    let shown = $state(false)

    $effect(() => {
        if(!working){
            shown = false
            return
        }
        const timer = setTimeout(() => shown = true, DELAY)
        return () => clearTimeout(timer)
    })
</script>

{#if shown}
    <div class="progress" role="progressbar" aria-label="Working" transition:fade={{ duration: duration('fast'), easing: easing('out') }}>
        <span></span>
    </div>
{/if}

<style>
    .progress {
        position: fixed;
        inset: env(safe-area-inset-top) 0 auto;
        z-index: 95;
        height: 3px;
        overflow: hidden;
        background: color-mix(in oklab, var(--theme-signature) 18%, transparent);
        view-transition-name: navigation-progress;
        pointer-events: none;
    }

    span {
        position: absolute;
        inset-block: 0;
        width: 40%;
        border-radius: 999px;
        background: var(--theme-signature);
        animation: run 1.1s var(--ease-in-out) infinite;
    }

    @keyframes run {
        from { translate: -100% 0; }
        to { translate: 250% 0; }
    }

    /* Without motion the bar just stands full */
    @media (prefers-reduced-motion: reduce) {
        span {
            width: 100%;
            animation: none;
        }
    }
</style>
