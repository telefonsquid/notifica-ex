import { withoutLeaving } from '#lib/relayout.ts';
import type { Attachment } from 'svelte/attachments';

/*
    Notes tile without holes: each one takes the highest free spot, in order. A card that only changes height keeps its column.
    CSS still decides the columns, this module stacks every cell in the one row and pushes it down by a top margin.
    Rows of a pixel each ran out past 10000 px in Firefox, its grids end there and the rest piled up.
*/



// PACK | glide() runs it too, so cards glide straight to their packed place
// Anchored keeps the first card on screen where it was, the observers ask for it
export function pack(grid: HTMLElement, anchored = false){
    const cells = [...grid.children].filter((cell): cell is HTMLElement => cell instanceof HTMLElement)
    const anchor = anchored ? anchorOf(grid, cells) : undefined
    const anchorTop = anchor?.getBoundingClientRect().top

    // Holds the page's height meanwhile, without placements it collapses and the browser scrolls to the top
    grid.style.minHeight = `${grid.offsetHeight}px`

    // Count the columns without the old placements | a card left past the last column keeps an extra one alive, squeezed to its narrowest
    const before = new Map(cells.map((cell) => [cell, parseInt(cell.style.gridColumnStart) - 1]))
    cells.forEach((cell) => Object.assign(cell.style, { gridRow: '', gridColumnStart: '', marginTop: '' }))
    const style = getComputedStyle(grid)
    const columns = style.gridTemplateColumns.split(' ').length
    const gap = Math.round(parseFloat(style.getPropertyValue('--note-row-gap')) || 0)

    // An open card shows its full label tabs, on the edge the settings picked
    const openGap = Math.round(parseFloat(style.getPropertyValue('--note-open-gap')) || 0)
    const room = Math.max(0, openGap - gap)
    const roomBelow = document.documentElement.dataset.labels === 'bottom'

    // Leaving cards float above the grid and keep no spot | a placed one would measure from its old spot
    const floating = cells.filter((cell) => cell.dataset.floating !== undefined)
    const placed = cells.filter((cell) => !floating.includes(cell))
    const heights = withoutLeaving(grid, () => placed.map((cell) => Math.ceil(cell.offsetHeight)))
    const spans = placed.map((cell) => Math.min(columns, parseInt(getComputedStyle(cell).gridColumnEnd.replace('span', '')) || 1))

    // Same cards in the same order keep their columns, a card that only changed height would reshuffle all after it
    const layout = `${columns}|${placed.map((cell, index) => `${cell.dataset.flip}:${spans[index]}`).join(',')}`
    const keep = grid.dataset.layout === layout
    grid.dataset.layout = layout

    // Every column remembers where it ends | a wide card needs neighbours that are free at once
    const bottoms: number[] = new Array(columns).fill(0)
    placed.forEach((cell, index) => {
        const span = spans[index]
        const kept = before.get(cell) ?? -1

        let column = 0, top = Infinity
        if(keep && kept >= 0 && kept + span <= columns){
            column = kept
            top = Math.max(...bottoms.slice(kept, kept + span))
        } else {
            for(let start = 0; start + span <= columns; start++){
                const free = Math.max(...bottoms.slice(start, start + span))
                if(free < top) [column, top] = [start, free]
            }
        }

        const open = cell.classList.contains('wide')
        if(open && !roomBelow && top > 0) top += room

        cell.style.gridColumnStart = `${column + 1}`
        cell.style.gridRow = '1'
        cell.style.marginTop = `${top}px`
        bottoms.fill(top + heights[index] + gap + (open && roomBelow ? room : 0), column, column + span)
    })

    grid.style.minHeight = ''
    grid.dataset.packed = ''

    // Cards above the screen that changed size would otherwise push the page under the reader
    if(anchor && anchorTop !== undefined){
        const shift = anchor.getBoundingClientRect().top - anchorTop
        if(Math.abs(shift) >= 1) scrollBy({ top: shift, behavior: 'instant' })
    }
}

// The first card fully on screen | an open, gliding or dragged card moves the page itself
function anchorOf(grid: HTMLElement, cells: HTMLElement[]){
    if(!scrollY || grid.querySelector('[data-note-open], [data-resizing], [data-dragging], [data-floating]')) return
    return cells.find((cell) => {
        const { top } = cell.getBoundingClientRect()
        return top >= 0 && top < innerHeight
    })
}

// MASONRY | packs again whenever a card changes size, the cards change or the window does
// Only the cards get observed: every pack changes the grid's height, and an observed grid would trip the observer's loop guard
export const masonry: Attachment<HTMLElement> = (grid) => {
    const resizes = new ResizeObserver(() => pack(grid, true))
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
    const loaded = () => requestAnimationFrame(() => pack(grid, true))
    grid.addEventListener('load', loaded, true)

    // Watching a cell reports its size once, before the next paint, and that is what packs them
    const changes = new MutationObserver(watch)
    changes.observe(grid, { childList: true })
    watch()

    return () => {
        resizes.disconnect()
        changes.disconnect()
        grid.removeEventListener('load', loaded, true)
        removeEventListener('resize', resized)
    }
}
