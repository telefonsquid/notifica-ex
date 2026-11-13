import type { Attachment } from 'svelte/attachments';

const EDGE = 12

type Size = { width: number, height: number }

// Corner grip on the bottom right that sizes the panel by hand, also below its own limits
// The size lasts only while the panel is open | a centred panel grows to both sides, its max size from CSS still holds
export function resizable(options: { min?: Size, centred?: boolean } = {}): Attachment<HTMLElement> {
    const min = options.min ?? { width: 160, height: 96 }
    const centred = options.centred ?? false

    return (node) => {
        const grip = document.createElement('span')
        grip.className = 'resize-grip'
        grip.setAttribute('aria-hidden', 'true')
        node.append(grip)

        // Never wider or taller than the room left to the viewport's edge
        function apply(size: Size){
            const rect = node.getBoundingClientRect()
            const room = centred ? centredRoom() : { width: innerWidth - rect.left - EDGE, height: innerHeight - rect.top - EDGE }
            const width = Math.max(min.width, Math.min(size.width, room.width))
            const height = Math.max(min.height, Math.min(size.height, room.height))
            node.style.width = `${width}px`
            node.style.height = `${height}px`
            node.style.minWidth = node.style.minHeight = '0'
            if(!centred) node.style.maxWidth = node.style.maxHeight = 'none'
            node.dataset.resized = ''
            return { width, height }
        }

        function centredRoom(): Size {
            const maxHeight = parseFloat(getComputedStyle(node).maxHeight)
            return { width: innerWidth - 2 * EDGE, height: Number.isNaN(maxHeight) ? innerHeight - 2 * EDGE : maxHeight }
        }

        let start: { x: number, y: number, width: number, height: number } | null = null

        function press(event: PointerEvent){
            if(event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            const rect = node.getBoundingClientRect()
            start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }
            grip.setPointerCapture(event.pointerId)
        }

        // Centred, the far edge moves as much as the grip, so the grip moves only half the size change
        function drag(event: PointerEvent){
            if(!start) return
            const grow = centred ? 2 : 1
            apply({ width: start.width + grow * (event.clientX - start.x), height: start.height + grow * (event.clientY - start.y) })
        }

        function release(){
            start = null
        }

        grip.addEventListener('pointerdown', press)
        grip.addEventListener('pointermove', drag)
        grip.addEventListener('pointerup', release)
        grip.addEventListener('pointercancel', release)

        // The element may live on without the grip, back at its own size then
        return () => {
            grip.remove()
            node.style.width = node.style.height = ''
            node.style.minWidth = node.style.minHeight = ''
            node.style.maxWidth = node.style.maxHeight = ''
            delete node.dataset.resized
        }
    }
}
