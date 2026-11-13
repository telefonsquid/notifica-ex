import { cssEasing, duration, type DurationToken } from '#lib/motion.ts';

/*
    What the grid's markup promises this file and the masonry packer:
    data-flip on every cell, holding the id it is measured under
    data-flip-body on the part inside that resizes
    data-flip-card on the card inside it, whose corners follow the glide
    data-note-open on the body of the open note
    data-flip-centred on a cell whose body is centred on a spot, it grows from its middle
    data-resizing on that part while it glides to a new size
    data-dragging on a cell that follows the pointer instead of gliding
    data-floating on a leaving cell out of the flow, the packer gives it no spot
*/

// The cell of a note not stored yet, the create button stands in for its old rect
export const NEW_CELL = 'new'

export const idOf = (cell: HTMLElement) => cell.dataset.flip
export const cellOf = (node: Element | null | undefined) => node?.closest<HTMLElement>('[data-flip]') ?? null
export const cellById = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-flip="${id}"]`)

// A cell on its way out, the glides leave it alone from here on
export function forgetCell(cell: HTMLElement){
    delete cell.dataset.flip
}

// Out of the grid flow so the others can glide into its place
export function floatCell(cell: HTMLElement, style: Partial<CSSStyleDeclaration>){
    Object.assign(cell.style, { position: 'absolute', ...style })
    cell.dataset.floating = ''
}

// Rects of every cell marked with data-flip, keyed by its value | taken before an update, mid glide too
export function measure(root: ParentNode): Map<string, DOMRect> {
    const cells = root.querySelectorAll<HTMLElement>('[data-flip]')
    return withoutLeaving(root, () => new Map([...cells].map((cell) => [cell.dataset.flip!, bodyOf(cell).getBoundingClientRect()])))
}

// Svelte makes leaving elements inert until their outro ends, so their space counts as gone already
export function withoutLeaving<T>(root: ParentNode, read: () => T): T {
    const leaving = [...root.querySelectorAll<HTMLElement>('[data-flip] [inert]')]
    leaving.forEach((node) => node.style.display = 'none')
    const result = read()
    leaving.forEach((node) => node.style.display = '')
    return result
}

// GLIDE | cells move from where they were to where the update put them | data-flip-body marks the part inside that resizes
// Layout runs once the cells hold their natural size, before the new rects are read
export function glide(root: ParentNode, before: Map<string, DOMRect>, layout?: () => void, speed: DurationToken = 'slow'){
    const time = duration(speed)
    const timing = { duration: time, easing: cssEasing('emphasized') }

    // Glides still running would skew the new rects | a dragged cell follows the pointer instead
    const cells = [...root.querySelectorAll<HTMLElement>('[data-flip]:not([data-dragging])')]
    cells.forEach(settle)
    layout?.()
    if(!time) return
    const after = measure(root)
    const heights = withoutLeaving(root, () => new Map(cells.map((cell) => [cell, cell.getBoundingClientRect().height])))

    for(const cell of cells){
        const from = before.get(cell.dataset.flip!)
        const to = after.get(cell.dataset.flip!)
        if(!from || !to) continue

        // A centred body moves its top while its height glides, its middle stays put
        const centred = cell.dataset.flipCentred !== undefined
        const dx = from.left - to.left
        const dy = centred ? from.top + from.height / 2 - (to.top + to.height / 2) : from.top - to.top
        const resized = Math.abs(from.width - to.width) > 1 || Math.abs(from.height - to.height) > 1
        if(Math.abs(dx) < 1 && Math.abs(dy) < 1 && !resized) continue
        if(!resized && offscreen(from) && offscreen(to)) continue           // Unseen glides only cost frames on phones

        const translate = [`${dx}px ${dy}px`, '0 0']
        const animations: Animation[] = []

        // The cell keeps its final size for the grid while its content grows or shrinks inside, so text reflows instead of stretching
        // Only the body travels then, the full size cell far from its spot would stretch the page and add scrollbars
        if(resized){
            const body = bodyOf(cell)
            cell.style.height = `${heights.get(cell)}px`
            cell.style.zIndex = '1'
            body.dataset.resizing = ''
            animations.push(body.animate({ translate, width: [`${from.width}px`, `${to.width}px`], height: [`${from.height}px`, `${to.height}px`] }, timing))
        }
        else animations.push(cell.animate({ translate }, timing))

        running.set(cell, animations)
        Promise.all(animations.map((animation) => animation.finished)).then(() => settle(cell), () => {})
    }
}

const running = new WeakMap<HTMLElement, Animation[]>()

export function offscreen(rect: DOMRect){
    return rect.bottom < 0 || rect.top > innerHeight
}

function settle(cell: HTMLElement){
    running.get(cell)?.forEach((animation) => animation.cancel())
    running.delete(cell)
    cell.style.height = ''
    cell.style.zIndex = ''
    delete bodyOf(cell).dataset.resizing
}

// The part that changes size, the cell itself when nothing inside is marked
export function bodyOf(cell: HTMLElement): HTMLElement {
    return cell.querySelector<HTMLElement>('[data-flip-body]') ?? cell
}
