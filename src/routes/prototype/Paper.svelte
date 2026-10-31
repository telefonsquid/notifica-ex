<script lang="ts">
    import type { Snippet } from 'svelte'
    import { CELL } from './paper.ts'

    // PROPS
    let { dark = false, children }: { dark?: boolean, children: Snippet } = $props()
</script>

<div class={['paper', dark && 'dark']} style:--cell="{CELL}px">
    {@render children()}
</div>

<style>
    .paper {
        --sheet: #fff9ee;
        --card: #fffdf8;
        --ink: #2b221b;
        --ink-soft: color-mix(in oklab, var(--ink) 66%, var(--sheet));
        --ink-faint: color-mix(in oklab, var(--ink) 42%, var(--sheet));
        --rule: color-mix(in oklab, #6b4a30 14%, transparent);
        --grid-line: color-mix(in oklab, #7a5f48 12%, transparent);
        --grid-major: color-mix(in oklab, #7a5f48 20%, transparent);
        --lift: 0 10px 22px -14px rgb(90 50 20 / 0.36);
        --accent: #ff5a12;
        --graphite: #261d18;
        --grain-invert: 0;
        --grain-opacity: 0.28;
        --warmth: rgb(255 170 90 / 0.14);

        position: relative;
        isolation: isolate;
        min-height: 100dvh;
        overflow-x: clip;
        color: var(--ink);
        font-family: var(--font-sans);
        background-color: var(--sheet);

        /* Warm glow from the top corner, painted once instead of blended over the page */
        background-image: radial-gradient(120% 100vh at 85% 0%, var(--warmth), transparent 70%);
        background-repeat: no-repeat;
        transition: background-color var(--duration-slow) var(--ease-in-out), color var(--duration-slow) var(--ease-in-out);
    }

    .dark {
        --sheet: #251f1a;
        --card: #2e2721;
        --ink: #f5ebdc;
        --rule: color-mix(in oklab, #f5d7b5 13%, transparent);
        --grid-line: color-mix(in oklab, #f0d9be 6%, transparent);
        --grid-major: color-mix(in oklab, #f0d9be 11%, transparent);
        --lift: 0 10px 22px -12px rgb(0 0 0 / 0.65);
        --graphite: #efe2cf;
        --grain-invert: 1;
        --grain-opacity: 0.18;
        --warmth: rgb(255 150 70 / 0.06);
    }

    /* Paper made of three noise layers: tooth, specks and an uneven tint, so nothing visibly repeats */
    /* It lies over the notes too | plain alpha instead of a blend mode keeps that cheap */
    .paper::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        filter: invert(var(--grain-invert));
        opacity: var(--grain-opacity);
        background-image:
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .32  0 0 0 0 .28  0 0 0 0 .24  1 0 0 0 -.5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E"),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='370' height='370'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.45' numOctaves='1' seed='13' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .25  0 0 0 0 .22  0 0 0 0 .2  0 0 16 0 -11.4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E"),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='1000'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.0035' numOctaves='3' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .6  0 0 0 0 .52  0 0 0 0 .42  0 0 0 .5 -.22'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E");
    }

    /* GRID | thin lines with a heavier one every ten cells, coming and going in large patches */
    .paper::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        background-image:
            linear-gradient(to right, var(--grid-major) 1px, transparent 1px),
            linear-gradient(var(--grid-major) 1px, transparent 1px),
            linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
            linear-gradient(var(--grid-line) 1px, transparent 1px);
        background-size:
            calc(var(--cell) * 10) calc(var(--cell) * 10),
            calc(var(--cell) * 10) calc(var(--cell) * 10),
            var(--cell) var(--cell),
            var(--cell) var(--cell);

        /* A grid line sits half a cell left of center, so odd cell widths center on the grid */
        background-position:
            calc(50% + var(--cell) / 2) 0,
            calc(50% + var(--cell) / 2) 0,
            calc(50% + var(--cell)) 0,
            calc(50% + var(--cell)) 0;

        /* The flat layer keeps the grid faintly there even where the patches fade it out */
        mask-image:
            linear-gradient(rgb(0 0 0 / 0.38) 0 0),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1600'%3E%3Cfilter id='b'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.0022' numOctaves='4' seed='21' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  4 0 0 0 -1.85'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23b)'/%3E%3C/svg%3E");
        mask-size: auto, 1600px;
    }
</style>
