<script lang="ts">
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let { class: className = '' }: { class?: ClassValue } = $props()
</script>

<!-- Repeat arrow around a tick, riso printed: a pink pass under the orange loop, the tick in blue -->
<span class={['logo inline-flex items-center gap-4', className]}>
    <svg class="mark shrink-0" viewBox="6 4 52 52" aria-hidden="true">
        <g class="pass pink">
            <path class="loop" d="M41.5 15.55A19 19 0 0 1 46.87 43.83M46.23 44.59A19 19 0 0 1 17.77 44.59M17.13 43.83A19 19 0 0 1 22.5 15.55" />
            <circle cx="41.5" cy="15.55" r="3" />
            <path class="head" d="M28.56 12.05L19.5 10.35L25.5 20.75Z" />
            <path class="tick" d="M25.5 32.5L30 37L38.5 27" />
        </g>
        <g class="pass orange">
            <path class="loop" d="M41.5 15.55A19 19 0 0 1 46.87 43.83M46.23 44.59A19 19 0 0 1 17.77 44.59M17.13 43.83A19 19 0 0 1 22.5 15.55" />
            <circle cx="41.5" cy="15.55" r="3" />
            <path class="head" d="M28.56 12.05L19.5 10.35L25.5 20.75Z" />
        </g>
        <g class="pass blue">
            <path class="tick" d="M25.5 32.5L30 37L38.5 27" />
        </g>
    </svg>

    <!-- Wordmark in the same drums, Ex in the tick's blue -->
    <span class="type-display wordmark" aria-label="Notifica Ex">
        <span class="word warm" data-text="Notifica" aria-hidden="true">Notifica</span>
        <span class="word cool" data-text="Ex" aria-hidden="true">Ex</span>
    </span>
</span>

<style>
    /* MARK | shrinks with the screen so the logo never overflows a phone */
    .mark {
        width: clamp(4rem, 22vw, 6rem);
        height: auto;
    }

    /* OVERPRINT | inks blend only with each other inside their own layer, never with the page */
    .mark,
    .word {
        isolation: isolate;
    }

    .pass {
        fill: none;
        stroke-width: 6;
        mix-blend-mode: var(--theme-riso-ink-blend);
    }

    .pass circle,
    .head {
        stroke-width: 1.5;
        stroke-linejoin: round;
    }

    .tick {
        stroke-width: 4.4;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .pink {
        stroke: var(--theme-riso-pink);
        fill: var(--theme-riso-pink);
        translate: 1.8px 1.4px;
        transition: translate var(--duration-slow) var(--ease-spring);
    }

    .orange {
        stroke: var(--theme-riso-orange);
        fill: var(--theme-riso-orange);
    }

    .blue { stroke: var(--theme-riso-blue); }

    .loop,
    .tick { fill: none; }

    /* WORDMARK | each word gets the pink pass slipped beside its ink like the loop | Syne narrows below its heaviest weight */
    .wordmark {
        display: grid;
        font-size: clamp(1.75rem, 10vw, 2.75rem);
        font-weight: 650;
        line-height: 0.9;
    }

    /* The letters only hold the space, both passes print on top in the loop's order */
    .word {
        position: relative;
        color: transparent;
    }

    .word::before,
    .word::after {
        content: attr(data-text);
        position: absolute;
        inset: 0;
    }

    .word::before {
        color: var(--theme-riso-pink);
        translate: 3px 2.5px;
        transition: translate var(--duration-slow) var(--ease-spring);
    }

    .word::after {
        color: var(--ink);
        mix-blend-mode: var(--theme-riso-ink-blend);
    }

    .warm { --ink: var(--theme-riso-orange); }
    .cool { --ink: var(--theme-riso-blue); }

    /* Print slips further off register */
    .logo:hover .pink { translate: 3.4px 2.6px; }
    .logo:hover .word::before { translate: 5px 4px; }
</style>
