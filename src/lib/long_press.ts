import type { Attachment } from 'svelte/attachments';

const HOLD = 500
const WIGGLE = 6

// Mouse held still for a moment | the click that follows the release gets swallowed. Touch has its own long press through the context menu
export function longPress(enabled: () => boolean, onhold: () => void): Attachment<HTMLElement> {
    return (node) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        let start = { x: 0, y: 0 }
        let held = false

        function press(event: PointerEvent){
            if(!enabled() || event.pointerType !== 'mouse' || event.button !== 0) return
            start = { x: event.clientX, y: event.clientY }
            held = false
            timer = setTimeout(() => {
                held = true
                onhold()
            }, HOLD)
        }

        function drift(event: PointerEvent){
            if(timer && Math.hypot(event.clientX - start.x, event.clientY - start.y) > WIGGLE) release()
        }

        function release(){
            clearTimeout(timer)
            timer = undefined
        }

        function swallow(event: MouseEvent){
            if(!held) return
            held = false
            event.stopPropagation()
            event.preventDefault()
        }

        node.addEventListener('pointerdown', press)
        node.addEventListener('pointermove', drift)
        node.addEventListener('pointerup', release)
        node.addEventListener('pointerleave', release)
        node.addEventListener('click', swallow, true)

        return () => {
            release()
            node.removeEventListener('pointerdown', press)
            node.removeEventListener('pointermove', drift)
            node.removeEventListener('pointerup', release)
            node.removeEventListener('pointerleave', release)
            node.removeEventListener('click', swallow, true)
        }
    }
}
