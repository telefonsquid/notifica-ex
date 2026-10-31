<script lang="ts">
    import { CELL, draw, type Pattern } from './paper.ts'

    // PROPS
    let { pattern, seed, size = CELL, class: className = '' }: {
        pattern: Pattern
        seed: number
        size?: number                   // Edge of one cell in px
        class?: string
    } = $props()

    let squares = $derived(draw(pattern, seed, size))
</script>

<!-- Static on purpose | animated or filtered squares made every repaint several times slower -->
<svg class={['squares', className]} width={pattern.width * size} height={pattern.height * size} aria-hidden="true">
    {#each squares as square, index (index)}
        <path class="ink" d={square.path} fill={square.color} style:rotate="{square.turn}deg" />
    {/each}
</svg>

<style>
    .squares {
        display: block;
        overflow: visible;
        pointer-events: none;
    }

    .ink {
        fill-rule: evenodd;
        transform-box: fill-box;
        transform-origin: center;
    }
</style>
