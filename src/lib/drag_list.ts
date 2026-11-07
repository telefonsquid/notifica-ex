import { duration } from '#lib/motion.ts';
import { flushSync } from 'svelte';

/*
    Drag to reorder for a column of elements, attached to the list so its rows need no wiring.
    Mouse and pen work anywhere on a row, touch only from a [data-drag-handle], the rest of a touch scrolls.
    Neighbours glide aside on inline translates, the list itself only changes once the drop has settled.
*/

const LIFT_AFTER = 6            // px, less is a click
const SCROLL_EDGE = 40          // px from the list's edge where dragging scrolls it
const SCROLL_STEP = 6           // px per frame

const GLIDE = 'translate var(--duration-base) var(--ease-in-out)'
const LANDING = `${GLIDE}, box-shadow var(--duration-base) var(--ease-out)`

// ====================================================================================================

export function sortable(commit: (from: number, to: number) => void) {
    return (list: HTMLElement) => {
        let press: { id: number, item: HTMLElement, y: number } | null = null
        let drag: Drag | null = null
        let landing = false
        let pointerY = 0
        let frame = 0

        type Drag = {
            item: HTMLElement
            items: HTMLElement[]
            from: number
            to: number
            tops: number[]              // where each row sat at the start
            bottoms: number[]
            shift: number               // how far a neighbour steps aside
            scroll: number              // the list's scroll at the start
        }

        // START
        function onDown(event: PointerEvent){
            if(event.button !== 0 || landing || drag) return

            const target = event.target as Element
            const handle = target.closest('[data-drag-handle]')
            if(event.pointerType === 'touch' && !handle) return
            if(!handle && target.closest('button, input, textarea, select')) return

            const item = [...list.children].find((child) => child.contains(target))
            if(!(item instanceof HTMLElement)) return

            press = { id: event.pointerId, item, y: event.clientY }
            addEventListener('pointermove', onMove)
            addEventListener('pointerup', onUp)
            addEventListener('pointercancel', onCancel)
        }

        function lift(item: HTMLElement){
            const items = [...list.children] as HTMLElement[]
            const boxes = items.map((row) => row.getBoundingClientRect())
            const from = items.indexOf(item)
            const gap = boxes.length > 1 ? boxes[1].top - boxes[0].bottom : 0

            drag = {
                item, items, from,
                to: from,
                tops: boxes.map((box) => box.top),
                bottoms: boxes.map((box) => box.bottom),
                shift: boxes[from].height + gap,
                scroll: list.scrollTop
            }

            for(const row of items) row.style.transition = row === item ? 'box-shadow var(--duration-fast) var(--ease-out)' : GLIDE
            list.dataset.sorting = ''
            item.dataset.lifted = ''
            frame = requestAnimationFrame(autoScroll)
        }

        // MOVE
        function onMove(event: PointerEvent){
            if(!press || event.pointerId !== press.id) return
            pointerY = event.clientY
            if(!drag){
                if(Math.abs(pointerY - press.y) < LIFT_AFTER) return
                lift(press.item)
            }
            follow()
        }

        function follow(){
            if(!drag || !press) return
            const { item, items, from, tops, bottoms, shift } = drag
            const last = items.length - 1

            // Stays within the list, also counts what the list scrolled meanwhile
            const moved = pointerY - press.y + list.scrollTop - drag.scroll
            const y = Math.min(Math.max(moved, tops[0] - tops[from]), bottoms[last] - bottoms[from])
            item.style.translate = `0 ${y}px`

            // A row gives way once the leading edge passes its middle, so the list's ends stay reachable when clamped
            const middle = (index: number) => (tops[index] + bottoms[index]) / 2
            const passedBelow = items.filter((_, index) => index > from && bottoms[from] + y > middle(index)).length
            const passedAbove = items.filter((_, index) => index < from && tops[from] + y < middle(index)).length
            const to = from + passedBelow - passedAbove
            if(to === drag.to) return

            drag.to = to
            items.forEach((row, index) => {
                if(row === item) return
                if(from < index && index <= to) row.style.translate = `0 ${-shift}px`
                else if(to <= index && index < from) row.style.translate = `0 ${shift}px`
                else row.style.translate = ''
            })
        }

        function autoScroll(){
            if(!drag) return
            if(list.scrollHeight > list.clientHeight){
                const box = list.getBoundingClientRect()
                if(pointerY < box.top + SCROLL_EDGE) list.scrollTop -= SCROLL_STEP
                else if(pointerY > box.bottom - SCROLL_EDGE) list.scrollTop += SCROLL_STEP
                follow()
            }
            frame = requestAnimationFrame(autoScroll)
        }

        // DROP
        function onUp(event: PointerEvent){
            if(!press || event.pointerId !== press.id) return
            finish(true)
        }

        function onCancel(event: PointerEvent){
            if(!press || event.pointerId !== press.id) return
            finish(false)
        }

        // Glides into its slot first, the list changes under it in one frame so nothing jumps
        function finish(keep: boolean){
            removeEventListener('pointermove', onMove)
            removeEventListener('pointerup', onUp)
            removeEventListener('pointercancel', onCancel)
            press = null
            cancelAnimationFrame(frame)

            const landed = drag
            drag = null
            if(!landed) return
            swallowClick()

            const { item, items, from, tops, bottoms } = landed
            const to = keep ? landed.to : from
            if(!keep) for(const row of items) row.style.translate = ''

            landing = true
            item.style.transition = LANDING
            delete item.dataset.lifted
            item.style.translate = `0 ${to > from ? bottoms[to] - bottoms[from] : tops[to] - tops[from]}px`

            setTimeout(() => {
                if(to !== from){
                    commit(from, to)
                    flushSync()
                }
                for(const row of items){
                    row.style.translate = ''
                    row.style.transition = ''
                }
                delete list.dataset.sorting
                landing = false
            }, duration('base'))
        }

        // A drag ends over a row, whose click would follow its link
        function swallowClick(){
            const swallow = (event: Event) => {
                event.preventDefault()
                event.stopPropagation()
            }
            addEventListener('click', swallow, { capture: true, once: true })
            setTimeout(() => removeEventListener('click', swallow, { capture: true }))
        }

        // Links and images start the browser's own drag otherwise
        const noNativeDrag = (event: Event) => event.preventDefault()

        list.addEventListener('pointerdown', onDown)
        list.addEventListener('dragstart', noNativeDrag)

        return () => {
            list.removeEventListener('pointerdown', onDown)
            list.removeEventListener('dragstart', noNativeDrag)
            removeEventListener('pointermove', onMove)
            removeEventListener('pointerup', onUp)
            removeEventListener('pointercancel', onCancel)
            cancelAnimationFrame(frame)
        }
    }
}
