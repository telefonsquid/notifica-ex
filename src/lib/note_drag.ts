import { cssEasing, duration } from '#lib/motion.ts';
import type { NoteGrid } from '#lib/note_grid.svelte.ts';
import { kept } from '#lib/note_list.ts';
import { positionBetween } from '#lib/note_position.ts';
import { cellOf } from '#lib/relayout.ts';
import { safeAction } from '#lib/safe_action.ts';
import type { Note } from '#lib/schemas/notes.ts';
import type { ViewSort } from '#lib/schemas/views.ts';
import { moveNote } from '../routes/api/notes.remote';

type Held = {
    id: string
    cell: HTMLElement
    start: { x: number, y: number }
    offset: { x: number, y: number }        // Where on the card it was grabbed
    from: string[] | null                   // The order when the drag began, null until the pointer really moved
    target: { cell: HTMLElement, after: boolean } | null       // The card it lands beside
}

type Page = {
    notes: () => Note[]
    visible: () => Note[]
    sort: () => ViewSort
    me: () => string
    editing: () => boolean
    selecting: () => boolean
}

/*
    The mouse moves cards in a manual sort. The grid holds still, a bar in the gap marks where the card lands.
*/
export class NoteDrag {
    #grid: NoteGrid
    #page: Page
    #held: Held | null = null
    #pointer = { x: 0, y: 0 }
    #dropped = false

    constructor(grid: NoteGrid, page: Page){
        this.#grid = grid
        this.#page = page
    }

    grab = (event: PointerEvent, id: string) => {
        const page = this.#page
        if(event.pointerType === 'touch' || event.button !== 0 || page.sort().by !== 'manual' || page.editing() || page.selecting()) return
        if(page.notes().find((note) => note.id === id)?.owner !== page.me()) return     // The order of a shared note is its owner's

        const cell = event.currentTarget as HTMLElement
        const rect = cell.getBoundingClientRect()
        this.#held = { id, cell, start: { x: event.clientX, y: event.clientY }, offset: { x: event.clientX - rect.left, y: event.clientY - rect.top }, from: null, target: null }
    }

    move = (event: PointerEvent) => {
        const held = this.#held
        if(!held) return
        const pointer = this.#pointer = { x: event.clientX, y: event.clientY }
        const grid = this.#grid

        // A few pixels of slack keep a plain click a click
        if(!held.from){
            if(Math.hypot(pointer.x - held.start.x, pointer.y - held.start.y) < 6) return
            held.from = this.#page.visible().map((note) => note.id)
            grid.frozen = held.from
            held.cell.dataset.dragging = ''
        }
        this.#follow()

        // The card under the pointer, the dragged one itself left out
        const over = document.elementsFromPoint(pointer.x, pointer.y).map(cellOf).find((cell) => cell && cell !== held.cell) ?? null
        if(!over && this.#inGrid()) return      // Gaps between cards keep the last mark
        this.#mark(over && this.#accepts(over.dataset.flip!) ? { cell: over, after: this.#past(over) } : null)
    }

    #inGrid = () => {
        const rect = this.#grid.element?.getBoundingClientRect()
        return !!rect && this.#pointer.x >= rect.left && this.#pointer.x <= rect.right && this.#pointer.y >= rect.top && this.#pointer.y <= rect.bottom
    }

    // Pinned notes stay among themselves while they sort first
    #accepts = (id: string) => {
        const notes = this.#page.notes()
        const moving = notes.find((note) => note.id === this.#held?.id)
        const passed = notes.find((note) => note.id === id)
        return !!moving && !!passed && (!this.#page.sort().pinnedFirst || moving.pinned === passed.pinned)
    }

    // Past the card's middle lands after it | a single column reads top to bottom, else left to right
    #past = (cell: HTMLElement) => {
        const rect = cell.getBoundingClientRect()
        const single = rect.width >= (this.#grid.element?.clientWidth ?? Infinity) - 1
        return single ? this.#pointer.y > rect.top + rect.height / 2 : this.#pointer.x > rect.left + rect.width / 2
    }

    #mark = (target: Held['target']) => {
        const held = this.#held!
        if(held.target?.cell === target?.cell && held.target?.after === target?.after) return

        if(held.target) delete held.target.cell.dataset.drop
        held.target = target
        if(target) target.cell.dataset.drop = target.after ? 'after' : 'before'
    }

    // Under the pointer wherever the grid placed the cell | offsets ignore the lift's scale
    #follow = () => {
        const held = this.#held
        const element = this.#grid.element
        if(!held?.from || !element) return

        const frame = element.getBoundingClientRect()
        const x = this.#pointer.x - held.offset.x - frame.left - held.cell.offsetLeft
        const y = this.#pointer.y - held.offset.y - frame.top - held.cell.offsetTop
        held.cell.style.translate = `${x}px ${y}px`
    }

    // Lands in its new place, between the neighbours it ended up with
    drop = async () => {
        if(!this.#held?.from){
            this.#held = null
            return
        }
        const { id, cell, from, target } = this.#held
        const grid = this.#grid
        this.#held = null
        this.#dropped = true
        setTimeout(() => this.#dropped = false)

        // The grid reorders only now
        const order = target ? from.filter((other) => other !== id) : from
        if(target){
            delete target.cell.dataset.drop
            order.splice(order.indexOf(target.cell.dataset.flip!) + (target.after ? 1 : 0), 0, id)
        }
        const moved = order.some((other, index) => other !== from[index])

        // Measured while still lifted, so the card glides from under the pointer along with the rest
        if(moved) grid.snapshot()
        const lifted = cell.style.translate
        cell.style.translate = ''
        delete cell.dataset.dragging
        if(moved) grid.frozen = order
        else cell.animate({ translate: [lifted, '0 0'] }, { duration: duration('base'), easing: cssEasing('emphasized') })

        const visible = this.#page.visible()
        const index = visible.findIndex((note) => note.id === id)
        const note = visible[index]
        if(!note || from.indexOf(id) === index){
            grid.frozen = null
            return
        }

        const { pinnedFirst, direction } = this.#page.sort()
        const neighbour = (other: Note | undefined) => other && (!pinnedFirst || other.pinned === note.pinned) ? other : undefined
        await safeAction(kept(moveNote({ id, position: positionBetween(neighbour(visible[index - 1]), neighbour(visible[index + 1]), direction) })))
        if(!this.#page.editing()) grid.frozen = null
    }

    // The release over its own card would open it
    swallow = (event: MouseEvent): boolean => {
        if(!this.#dropped) return false
        event.stopPropagation()
        event.preventDefault()
        return true
    }
}
