import type { Attachment } from 'svelte/attachments';

/*
    Hints for icon buttons. Elements opt in with {@attach tip('Text')}, the one
    tooltip in the root layout shows the text of whichever is hovered or focused.
*/

export const tooltip = $state<{ text: string, anchor: HTMLElement | null }>({ text: '', anchor: null })

const DELAY = 250
const COOLDOWN = 300

let timer: ReturnType<typeof setTimeout> | undefined
let waiting: HTMLElement | null = null     // element whose hint is about to show
let cooling: ReturnType<typeof setTimeout> | undefined
let warm = false                    // right after a hint, the next one shows without waiting

// TIP | mouse hover and keyboard focus, a finger gets none since it would cover the button
export function tip(text: string): Attachment<HTMLElement> {
    return (node) => {
        function show(){
            clearTimeout(timer)
            waiting = node
            timer = setTimeout(() => {
                waiting = null
                tooltip.text = text
                tooltip.anchor = node
            }, warm ? 0 : DELAY)
        }

        function hover(event: PointerEvent){
            if(event.pointerType !== 'touch') show()
        }

        function focus(){
            if(node.matches(':focus-visible')) show()
        }

        function hide(){
            if(waiting === node){
                clearTimeout(timer)
                waiting = null
            }
            if(tooltip.anchor !== node) return
            tooltip.anchor = null
            warm = true
            clearTimeout(cooling)
            cooling = setTimeout(() => warm = false, COOLDOWN)
        }

        node.addEventListener('pointerenter', hover)
        node.addEventListener('pointerleave', hide)
        node.addEventListener('pointerdown', hide)
        node.addEventListener('focusin', focus)
        node.addEventListener('focusout', hide)

        // A new text while hovered, like a delete that asks for a second click, shows right away
        if((matchMedia('(hover: hover)').matches && node.matches(':hover')) || node.matches(':focus-visible')) show()

        return () => {
            node.removeEventListener('pointerenter', hover)
            node.removeEventListener('pointerleave', hide)
            node.removeEventListener('pointerdown', hide)
            node.removeEventListener('focusin', focus)
            node.removeEventListener('focusout', hide)
            hide()
        }
    }
}
