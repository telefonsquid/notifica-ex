<script lang="ts">
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let { class: className = '' }: { class?: ClassValue } = $props()
</script>

<!-- Repeat arrow around a tick, printed twice like a riso print -->
{#snippet loop(kind: string)}
    <g class={['pass', kind]}>
        <path d="M41.5 15.55A19 19 0 0 1 46.87 43.83M46.23 44.59A19 19 0 0 1 17.77 44.59M17.13 43.83A19 19 0 0 1 22.5 15.55" />
        <circle class="fill" cx="41.5" cy="15.55" r="3" />
        <path class="fill head" d="M28.56 12.05L19.5 10.35L25.5 20.75Z" />
        <path class="tick" d="M25.5 32.5L30 37L38.5 27" />
    </g>
{/snippet}

<span class={['logo inline-flex items-center gap-3', className]}>
    <svg class="mark size-10 shrink-0" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="15" fill="#ff5b19" />
        {@render loop('ghost')}
        {@render loop('ink')}
    </svg>
    <span class="type-display text-2xl text-ink">notifica<span class="text-accent">·ex</span></span>
</span>

<style>
    /* Fixed colours, the logo looks the same in every theme */
    .pass {
        fill: none;
        stroke-width: 6;
        mix-blend-mode: multiply;
    }

    .ghost {
        stroke: #7f230f;
        opacity: 0.45;
        translate: 1.8px 1.4px;
        transition: translate var(--duration-slow) var(--ease-spring);
    }

    .ink { stroke: #161616; }
    .fill { stroke: none; }
    .ghost .fill { fill: #7f230f; }
    .ink .fill { fill: #161616; }

    .head {
        stroke: inherit;
        stroke-width: 1.5;
        stroke-linejoin: round;
    }

    .tick {
        stroke-width: 4;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    /* Print slips further off register */
    .logo:hover .ghost { translate: 3.4px 2.6px; }
</style>
