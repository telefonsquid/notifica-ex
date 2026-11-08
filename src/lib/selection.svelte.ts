import { SvelteSet } from 'svelte/reactivity';

/*
    Picked notes on the page. A plain click toggles one, a shift click takes the whole stretch
    from the last one clicked, in whatever order the grid shows them.
*/
export class Selection {
    #ids = new SvelteSet<string>()
    #anchor: string | null = null      // the last note clicked, where a shift click range starts

    has(id: string): boolean {
        return this.#ids.has(id)
    }

    clear(){
        this.#ids.clear()
        this.#anchor = null
    }

    toggle(id: string){
        if(this.#ids.has(id)) this.#ids.delete(id)
        else this.#ids.add(id)
        this.#anchor = id
    }

    add(ids: string[]){
        for(const id of ids) this.#ids.add(id)
    }

    // The stretch from the anchor to this note follows the note: picked when it wasn't, dropped when it was
    toggleRange(id: string, order: string[]){
        const from = this.#anchor && this.#ids.size ? order.indexOf(this.#anchor) : -1
        const to = order.indexOf(id)
        if(from < 0 || to < 0) return this.toggle(id)

        const pick = !this.#ids.has(id)
        for(const other of order.slice(Math.min(from, to), Math.max(from, to) + 1)){
            if(pick) this.#ids.add(other)
            else this.#ids.delete(other)
        }
        this.#anchor = id
    }
}
