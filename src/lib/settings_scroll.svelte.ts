import { untrack } from 'svelte';

// Where a settled section's top sits on screen
function snapLine(stage: HTMLElement){
    return stage.getBoundingClientRect().top + (parseFloat(getComputedStyle(stage).scrollPaddingTop) || 0)
}

/*
    One long scroll that snaps to a section, the one at the top is current.
*/
export class SettingsScroll {
    tab = $state('')
    stage = $state<HTMLElement>()

    #sections: () => string[]
    #jumping = false        // A tab click scrolls past other sections, they shouldn't light up on the way
    #landing: ReturnType<typeof setTimeout> | undefined

    constructor(sections: () => string[]){
        this.#sections = sections
        this.tab = untrack(sections)[0]
    }

    #section(id: string){
        return this.stage?.querySelector<HTMLElement>(`[data-section="${id}"]`)
    }

    go = (id: string) => {
        const { stage } = this
        const section = this.#section(id)
        if(!stage || !section) return

        this.tab = id
        this.#jumping = true
        clearTimeout(this.#landing)
        this.#landing = setTimeout(() => this.#jumping = false, 1000)       // In case scrollend never fires

        const top = stage.scrollTop + section.getBoundingClientRect().top - snapLine(stage)
        stage.scrollTo({ top, behavior: 'smooth' })
    }

    // The last section whose top reached the snap line, with some slack for a scroll that isn't done yet
    follow = () => {
        if(this.#jumping || !this.stage) return

        const line = snapLine(this.stage) + 48
        const sections = this.#sections()
        let current = sections[0]
        for(const id of sections){
            const top = this.#section(id)?.getBoundingClientRect().top
            if(top !== undefined && top <= line) current = id
        }
        this.tab = current
    }

    land = () => {
        this.#jumping = false
        clearTimeout(this.#landing)
    }
}
