<script lang="ts">
    import { CELL, solid } from './paper.ts'

    // PROPS
    let { on = false, color = 'var(--ink)', seed = 1, size = CELL }: { on?: boolean, color?: string, seed?: number, size?: number } = $props()

    let fill = $derived(solid(seed, 4, 4, size - 8))
</script>

<svg class={['tick', on && 'on']} width={size} height={size} aria-hidden="true">
    <rect class="box" x="2.5" y="2.5" width={size - 5} height={size - 5} rx="1.5" />
    <path class="fill" d={fill} fill={color} />
</svg>

<style>
    .tick {
        display: block;
        flex: none;
        overflow: visible;
    }

    .box {
        fill: none;
        stroke: currentColor;
        stroke-width: 1;
        opacity: 0.4;
    }

    .fill {
        fill-rule: evenodd;
        transform-box: fill-box;
        transform-origin: center;
        scale: 0;
        transition: scale var(--duration-base) var(--ease-out);
    }

    .on .fill {
        scale: 1;
        transition-timing-function: var(--ease-spring);
    }
</style>
