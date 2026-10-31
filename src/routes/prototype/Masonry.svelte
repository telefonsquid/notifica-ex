<script lang="ts" generics="T extends { id: string }">
    import type { Snippet } from 'svelte'
    import { CELL } from './paper.ts'

    // PROPS
    let { items, tile, frame, max = 5 }: {
        items: T[]
        tile: Snippet<[T]>
        frame?: Snippet<['above' | 'below', number]>     // Gets the field width in cells
        max?: number
    } = $props()

    // COLUMNS | 17 cells plus a 1 cell gap, so the total stays odd and centers on the grid
    let width = $state(0)

    let columns = $derived.by(() => {
        const cells = Math.floor(width / CELL)
        const fits = Math.floor((cells + 1) / 18)

        // Never more columns than notes, so a short list still sits in the middle
        const used = (most: number) => Math.max(1, Math.min(most, items.length))
        if(fits >= 2) return { count: used(Math.min(max, fits)), cells: 17 }

        // Phones get two narrower columns, tiny screens a single one
        const narrow = Math.floor((cells - 1) / 2)
        if(narrow >= 9) return { count: used(2), cells: narrow }
        return { count: 1, cells: cells % 2 === 0 ? cells - 1 : cells }
    })

    let total = $derived(columns.count * columns.cells + columns.count - 1)

    // PLACEMENT | every note goes into the currently shortest column
    let heights: Record<string, number> = $state({})

    let layout = $derived.by(() => {
        const tops = Array<number>(columns.count).fill(0)
        const spots: Record<string, { x: number, y: number }> = {}

        for(const item of items){
            const column = tops.indexOf(Math.min(...tops))
            spots[item.id] = { x: column * (columns.cells + 1) * CELL, y: tops[column] }
            tops[column] += (heights[item.id] ?? 0) + CELL
        }

        return { spots, height: Math.max(0, Math.max(...tops) - CELL) }
    })

    // Notes jump into place on the first layout and glide on every later one
    let ready = $state(false)

    $effect(() => {
        if(!width || ready) return
        const frame = requestAnimationFrame(() => ready = true)
        return () => cancelAnimationFrame(frame)
    })
</script>

<div class="masonry" bind:clientWidth={width}>
    {@render frame?.('above', total)}

    <div class={['field', ready && 'ready']} style:width="{total * CELL}px" style:height="{layout.height}px">
        {#each items as item (item.id)}
            {@const spot = layout.spots[item.id]}

            <div
                class="tile"
                style:width="{columns.cells * CELL}px"
                style:translate="{spot.x}px {spot.y}px"
                bind:clientHeight={heights[item.id]}
            >
                {@render tile(item)}
            </div>
        {/each}
    </div>

    {@render frame?.('below', total)}
</div>

<style>
    .field {
        position: relative;
        margin-inline: auto;
        opacity: 0;
    }

    .field.ready {
        opacity: 1;
    }

    /* Container, so tiles can adapt their padding to the column width */
    .tile {
        position: absolute;
        top: 0;
        left: 0;
        container-type: inline-size;
    }

    .ready .tile {
        transition: translate var(--duration-slow) var(--ease-spring);
    }
</style>
