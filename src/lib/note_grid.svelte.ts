import { onNavigate } from '$app/navigation';
import { page } from '$app/state';
import { pack } from '#lib/masonry.ts';
import { duration, easing } from '#lib/motion.ts';
import { floatCell, forgetCell, glide, measure, NEW_CELL, offscreen } from '#lib/relayout.ts';
import { flushSync, untrack } from 'svelte';
import type { TransitionConfig } from 'svelte/transition';

/*
    The note grid's layout: every change glides the cells from where they were, the editor arriving late too.
    Opening a note and dragging one both hold the order still through frozen.
*/
export class NoteGrid {
    element = $state<HTMLElement>()
    frozen = $state.raw<string[] | null>(null)

    #before: Map<string, DOMRect> | undefined
    #pending = false

    // Rects before the next change, the first one wins until its glide ran | the create button joins it even then
    snapshot(origin?: DOMRect | null){
        if(!this.element) return
        this.#before ??= measure(this.element)
        if(origin) this.#before.set(NEW_CELL, origin)
    }

    // Order holds still while frozen, every autosave would reshuffle an open card otherwise
    ordered<T extends { id: string }>(sorted: T[]): T[] {
        if(!this.frozen) return sorted
        const rank = Object.fromEntries(this.frozen.map((id, index) => [id, index]))
        return sorted.toSorted((a, b) => (rank[a.id] ?? -1) - (rank[b.id] ?? -1))
    }

    // Glides whenever one of these inputs changes | called by the page once they exist
    follow(inputs: () => unknown[]){

        // Opening and closing take the snapshot themselves, a card may change before this runs then
        // Untracked, the grid binding alone would leave a snapshot that no glide ever takes
        $effect.pre(() => {
            inputs()
            untrack(() => this.snapshot())
        })

        // Another view swaps the cells before the effect above runs, so cards on both glide from here
        onNavigate(({ to }) => {
            if(to?.route.id === page.route.id) this.snapshot()
        })

        // Waits for the effects of the cells too, the editor fills in its text only then
        // Not tick(), which waits a frame in async mode and shows the new layout unanimated meanwhile
        $effect(() => {
            inputs()
            if(!this.#before || this.#pending) return
            this.#pending = true
            queueMicrotask(() => {
                flushSync()
                const from = this.#before
                const element = this.element
                this.#before = undefined
                this.#pending = false
                if(element && from) glide(element, from, () => pack(element))
            })
        })
    }

    // Leaving cards fade where they stood, out of the flow so the rest glide into their place
    leave = (node: HTMLElement, id: string): TransitionConfig => {
        const from = this.#before?.get(id) ?? node.getBoundingClientRect()
        forgetCell(node)
        if(offscreen(from)){
            node.style.display = 'none'
            return { duration: 1 }      // An empty transition ends at once, Svelte then never removes the card while others still fade
        }

        const frame = this.element?.getBoundingClientRect()
        if(frame) floatCell(node, { left: `${from.left - frame.left}px`, top: `${from.top - frame.top}px`, width: `${from.width}px` })

        return {
            duration: duration('fast'),
            easing: easing('out'),
            css: (t) => `opacity: ${t}; scale: ${0.97 + 0.03 * t};`
        }
    }
}
