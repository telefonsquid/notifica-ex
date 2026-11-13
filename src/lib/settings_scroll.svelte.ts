import { untrack } from 'svelte';

const SLACK = 48        // A section counts as reached a little before its top meets the stage's

/*
    One long scroll through every section, the tab follows the one at the top.
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

        const top = stage.scrollTop + section.getBoundingClientRect().top - stage.getBoundingClientRect().top
        stage.scrollTo({ top, behavior: 'smooth' })
    }

    // The last section whose top reached the stage's | at the very end the last one, short sections never reach the top
    follow = () => {
        const { stage } = this
        if(this.#jumping || !stage) return

        const sections = this.#sections()
        if(stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 1){
            this.tab = sections.at(-1) ?? this.tab
            return
        }

        const line = stage.getBoundingClientRect().top + SLACK
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
