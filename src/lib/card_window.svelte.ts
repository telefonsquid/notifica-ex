import { estimatedHeight } from '#lib/notes.ts';
import type { Note } from '#lib/schemas.ts';
import type { Attachment } from 'svelte/attachments';
import { SvelteSet } from 'svelte/reactivity';

/*
    Very long lists keep only the cards near the screen, the others are empty boxes of the same height.
    The boxes stay in the grid, so masonry and glides work as if every card were there.
*/

// Small lists stay fully rendered, nothing to gain there
export const CARD_WINDOW_FROM = 200

// Up front before the first scroll report, the page's first paint shows these
export const CARDS_ALWAYS_SHOWN = 24

// Far enough that a card is ready and measured before it scrolls into sight
const REACH = '1500px 0px'

export class CardWindow {
    #near = new SvelteSet<string>()

    // Read when a card turns into a box, nothing has to react to a change
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    #heights = new Map<string, number>()

    shows(id: string) {
        return this.#near.has(id)
    }

    // Its real height once it has been on screen, a guess until then
    height(note: Note) {
        return this.#heights.get(note.id) ?? estimatedHeight(note)
    }

    watch: Attachment<HTMLElement> = (grid) => {
        const scrolled = new IntersectionObserver((entries) => {
            for(const { target, isIntersecting } of entries){
                const cell = target as HTMLElement
                const id = cell.dataset.flip
                if(!id) continue

                if(isIntersecting) this.#near.add(id)
                else if(this.#near.delete(id)) this.#heights.set(id, cell.offsetHeight)
            }
        }, { rootMargin: REACH })

        const changes = new MutationObserver((records) => {
            for(const { addedNodes, removedNodes } of records){
                for(const node of addedNodes) if(node instanceof HTMLElement) scrolled.observe(node)
                for(const node of removedNodes) if(node instanceof HTMLElement) scrolled.unobserve(node)
            }
        })
        changes.observe(grid, { childList: true })
        for(const cell of grid.children) scrolled.observe(cell)

        return () => {
            scrolled.disconnect()
            changes.disconnect()
            this.#near.clear()
        }
    }
}
