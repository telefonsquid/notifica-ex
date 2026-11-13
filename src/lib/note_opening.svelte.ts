import type { SharedNote } from '#lib/android_share.ts';
import { duration, easing, rise, stagger } from '#lib/motion.ts';
import { noteEditor } from '#lib/note_editor.svelte.ts';
import { readable } from '#lib/note_lock.svelte.ts';
import type { NoteGrid } from '#lib/note_grid.svelte.ts';
import { bodyOf, cellById, cellOf, floatCell, forgetCell } from '#lib/relayout.ts';
import { resizable } from '#lib/resizable.ts';
import type { Note } from '#lib/schemas/notes.ts';
import { tick } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { MediaQuery } from 'svelte/reactivity';
import type { TransitionConfig } from 'svelte/transition';

const UNSEEN_FROM = 40      // Cards this far down the list skip their entrance, nobody sees it
const FLOAT_FROM = 8        // Fewer notes make room for an open one in place
const FLOAT_WIDTH = 640
const TOOLBAR_ROOM = 80     // Floating notes centre in the screen above the toolbar

// Where a floating note sits, in the coordinates of its cell
type Afloat = { ghost: number, x: number, y: number, width: number }

function afloatAt(cell: HTMLElement, grid: HTMLElement): Afloat {
    const rect = cell.getBoundingClientRect()
    const frame = grid.getBoundingClientRect()
    return {
        ghost: rect.height,
        x: frame.left + frame.width / 2 - rect.left,
        y: (innerHeight - TOOLBAR_ROOM) / 2 - rect.top,
        width: Math.min(FLOAT_WIDTH, frame.width)
    }
}

// Brings the whole open note into view, its top first when it is taller than the screen
// The cell already has the size and spot the glide ends with
function reveal(cell: HTMLElement | null){
    if(!cell) return
    const style = getComputedStyle(cell)
    const room = innerHeight - parseFloat(style.scrollMarginTop) - parseFloat(style.scrollMarginBottom)
    cell.scrollIntoView({ block: cell.offsetHeight > room ? 'start' : 'nearest', behavior: 'smooth' })
}

/*
    Which note is open. One card at a time opens in place, a new note grows out of the create button.
    Every step waits for the one before it, a click during a glide lands after that glide.
*/
export class NoteOpening {
    current = $state<{ key: number, id: string | null, fresh: boolean, focus?: string, shared: SharedNote | null, afloat: Afloat | null } | null>(null)      // The key changes per opening, so every note starts with a fresh draft
    closing = $state(false)
    freshNote = $state<{ flush: () => Promise<string | null> }>()
    createButton = $state<HTMLElement>()

    #grid: NoteGrid
    #ids: () => string[]
    #busy: Promise<unknown> = Promise.resolve()
    #opened = 0
    #handover: string | null = null
    #returning = false
    #wide = new MediaQuery('width >= 40rem')
    #mouse = new MediaQuery('pointer: fine')

    // Floating notes take a corner grip where a mouse can hold it
    sizer = resizable({ centred: true, min: { width: 320, height: 200 } })
    get resizes(){ return this.#mouse.current }

    constructor(grid: NoteGrid, ids: () => string[]){
        this.#grid = grid
        this.#ids = ids
    }

    // A locked note asks for the password first, the card opens with its text or not at all
    edit = async (note: Note | null, focus?: string) => {
        if(note?.unreadable && !await readable(note)) return
        this.#open(note, focus, null)
    }

    // Shared from another app into a new note
    openShared = (shared: SharedNote) => this.#open(null, undefined, shared)

    #open(note: Note | null, focus: string | undefined, shared: SharedNote | null){
        this.#busy = this.#busy.then(async () => {
            if(note && this.current?.id === note.id) return
            await this.#fold()
            await noteEditor.load()     // One glide only, a late editor would move the grid a second time | touch screens never preload it

            this.#grid.frozen = this.#ids()
            this.#grid.snapshot(note ? null : this.createButton?.getBoundingClientRect())
            this.current = { key: ++this.#opened, id: note?.id ?? null, fresh: !note, focus, shared, afloat: this.#afloat(note) }
            this.closing = false
            await tick()
            if(!this.current.afloat) reveal(cellOf(document.querySelector('[data-note-open]')))
        })
    }

    // A full grid on a wide screen keeps still, the note floats to the centre of the screen instead of pushing the others aside
    #afloat(note: Note | null): Afloat | null {
        const grid = this.#grid.element
        const cell = note && grid && cellById(grid, note.id)
        if(!cell || !this.#wide.current || this.#ids().length < FLOAT_FROM) return null
        return afloatAt(cell, grid)
    }

    // Holds the page still under a floating note and keeps the note centred when the window changes size
    float: Attachment<HTMLElement> = (cell) => {
        const root = document.documentElement
        root.style.overflow = 'hidden'

        let frame = 0
        const follow = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
                const grid = this.#grid.element
                if(this.current?.afloat && grid) this.current.afloat = { ...afloatAt(cell, grid), ghost: this.current.afloat.ghost }
            })
        }
        addEventListener('resize', follow)

        return () => {
            cancelAnimationFrame(frame)
            removeEventListener('resize', follow)
            root.style.overflow = ''
        }
    }

    close = () => {
        this.#busy = this.#busy.then(async () => {
            if(!this.current) return
            await this.#fold()
            this.#grid.snapshot(null, true)
            this.shut()
        })
    }

    shut = () => {
        this.current = null
        this.#grid.frozen = null
        this.closing = false
    }

    // A new note got stored, its card is followed by id from then on
    created = (id: string) => {
        if(this.current) this.current.id = id
    }

    // The open note's controls fade first | a new note then hands over to its card, or shrinks back into the button when empty
    async #fold(){
        this.#handover = null
        this.#returning = false
        if(!this.current) return

        this.closing = true
        await new Promise((done) => setTimeout(done, duration('fast')))
        if(!this.current?.fresh) return

        const id = await this.freshNote?.flush()
        this.#handover = id ?? null
        this.#returning = !id
    }

    // New cards rise into place, the card taking over from a new note glides there instead
    enter = (node: Element, { id, index }: { id: string, index: number }): TransitionConfig => {
        return id === this.#handover || index >= UNSEEN_FROM ? {} : rise(node, { delay: stagger(index) })
    }

    // A saved new note makes room for its card at once, an empty one shrinks back into the button
    retreat = (node: HTMLElement): TransitionConfig => {
        forgetCell(node)
        const button = this.createButton
        const grid = this.#grid.element
        const body = bodyOf(node)
        const card = body.querySelector<HTMLElement>('[data-flip-card]')
        if(!this.#returning || !button || !grid || !card){
            node.style.display = 'none'
            return {}
        }

        // Starts where it is seen, an open glide still running included
        const from = body.getBoundingClientRect();
        [node, body].forEach((part) => part.getAnimations().forEach((animation) => animation.cancel()))
        const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius)

        floatCell(node, { height: '', zIndex: '1' })
        body.dataset.resizing = ''

        // Grid and button both move while the others settle, so both are read every frame
        const place = (t: number, u: number) => {
            const target = button.getBoundingClientRect()
            const frame = grid.getBoundingClientRect()
            node.style.left = `${target.left + t * (from.left - target.left) - frame.left}px`
            node.style.top = `${target.top + t * (from.top - target.top) - frame.top}px`
            node.style.width = body.style.width = `${target.width + t * (from.width - target.width)}px`    // A wider cell would overhang the page near the button
            body.style.height = `${target.height + t * (from.height - target.height)}px`
            card.style.borderRadius = `${radius + u * (target.height / 2 - radius)}px`
        }
        place(1, 0)

        return {
            duration: duration('slow'),
            easing: easing('emphasized'),
            css: (t) => `opacity: ${Math.min(1, t * 3)};`,
            tick: place
        }
    }
}
