import { withoutLeaving } from '#lib/motion.ts';
import type { Attachment } from 'svelte/attachments';

/*
    Notes tile without holes: each one takes the highest free spot, in order.
    CSS still decides the columns, this module places every cell on rows of a single pixel.
*/



// PACK | glide() runs it too, so cards glide straight to their packed place
export function pack(grid: HTMLElement){
    const style = getComputedStyle(grid)
    const columns = style.gridTemplateColumns.split(' ').length
    const gap = Math.round(parseFloat(style.getPropertyValue('--note-row-gap')) || 0)

    // Leaving cards float above the grid and keep no spot | a placed one would measure from its old spot
    const cells = [...grid.children].filter((cell): cell is HTMLElement => cell instanceof HTMLElement)
    const floating = cells.filter((cell) => cell.style.position === 'absolute')
    floating.forEach((cell) => Object.assign(cell.style, { gridRow: '', gridColumnStart: '' }))
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

        cell.style.gridColumnStart = `${column + 1}`
        cell.style.gridRow = `${top + 1} / span ${Math.max(1, heights[index])}`
        bottoms.fill(top + heights[index] + gap, column, column + span)
    })

    grid.dataset.packed = ''
}

// MASONRY | packs again whenever a card changes size or the cards change
// Cells are watched instead of the grid, whose height every pack changes
export const masonry: Attachment<HTMLElement> = (grid) => {
    const resizes = new ResizeObserver(() => pack(grid))
    const watch = () => {
        resizes.disconnect()
        for(const cell of grid.children) resizes.observe(cell)
    }

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
    }
}
