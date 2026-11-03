import { withoutLeaving } from '#lib/motion.ts';
import type { Attachment } from 'svelte/attachments';

/*
    Notes tile without holes: each one takes the highest free spot, in order.
    CSS still decides the columns, this module places every cell on rows of a single pixel.
*/



// PACK | glide() runs it too, so cards glide straight to their packed place
export function pack(grid: HTMLElement){
    const cells = [...grid.children].filter((cell): cell is HTMLElement => cell instanceof HTMLElement)

    // Holds the page's height meanwhile, without placements it collapses and the browser scrolls to the top
    grid.style.minHeight = `${grid.offsetHeight}px`

    // Count the columns without the old placements | a card left past the last column keeps an extra one alive, squeezed to its narrowest
    cells.forEach((cell) => Object.assign(cell.style, { gridRow: '', gridColumnStart: '' }))
    const style = getComputedStyle(grid)
    const columns = style.gridTemplateColumns.split(' ').length
    const gap = Math.round(parseFloat(style.getPropertyValue('--note-row-gap')) || 0)

    // An open card shows its full label tabs, on the edge the settings picked
    const openGap = Math.round(parseFloat(style.getPropertyValue('--note-open-gap')) || 0)
    const room = Math.max(0, openGap - gap)
    const roomBelow = document.documentElement.dataset.labels === 'bottom'

    // Leaving cards float above the grid and keep no spot | a placed one would measure from its old spot
    const floating = cells.filter((cell) => cell.style.position === 'absolute')
    const placed = cells.filter((cell) => !floating.includes(cell))
    const heights = withoutLeaving(grid, () => placed.map((cell) => Math.ceil(cell.offsetHeight)))

    // Every column remembers where it ends | a wide card needs neighbours that are free at once
    const bottoms: number[] = new Array(columns).fill(0)
    placed.forEach((cell, index) => {
        const span = Math.min(columns, parseInt(getComputedStyle(cell).gridColumnEnd.replace('span', '')) || 1)

        let column = 0, top = Infinity
        for(let start = 0; start + span <= columns; start++){
            const free = Math.max(...bottoms.slice(start, start + span))
            if(free < top) [column, top] = [start, free]
        }

        const open = cell.classList.contains('wide')
        if(open && !roomBelow && top > 0) top += room

        cell.style.gridColumnStart = `${column + 1}`
        cell.style.gridRow = `${top + 1} / span ${Math.max(1, heights[index])}`
        bottoms.fill(top + heights[index] + gap + (open && roomBelow ? room : 0), column, column + span)
    })

    grid.style.minHeight = ''
    grid.dataset.packed = ''
}

// MASONRY | packs again whenever a card changes size, the cards change or the window does
// Only the cards get observed: every pack changes the grid's height, and an observed grid would trip the observer's loop guard
export const masonry: Attachment<HTMLElement> = (grid) => {
    const resizes = new ResizeObserver(() => pack(grid))
    const watch = () => {
        resizes.disconnect()
        for(const cell of grid.children) resizes.observe(cell)
    }

    // The column count follows the grid's width, which only the window changes
    let width = grid.clientWidth
    const resized = () => {
        if(grid.clientWidth === width) return
        width = grid.clientWidth
        pack(grid)
    }
    addEventListener('resize', resized)

    // A late image grows its card, catch it even when the resize got lost to a running glide
    const loaded = () => requestAnimationFrame(() => pack(grid))
    grid.addEventListener('load', loaded, true)

    const changes = new MutationObserver(() => {
        watch()
        pack(grid)
    })
    changes.observe(grid, { childList: true })

    watch()
    pack(grid)

    return () => {
        resizes.disconnect()
        changes.disconnect()
        grid.removeEventListener('load', loaded, true)
        removeEventListener('resize', resized)
    }
}
