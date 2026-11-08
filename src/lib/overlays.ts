import type { Attachment } from 'svelte/attachments';

// Everything that floats above the page, opened from whatever is below it
const FLOATING = '[data-bits-floating-content-wrapper], [data-popover-content], [data-dialog-content]'

const floatingOpen = () => !!document.querySelector(`${FLOATING}[data-state='open']`)
export const menuOpen = () => !!document.querySelector('[role=menu]')
export const dialogOpen = () => !!document.querySelector('[data-dialog-content]')

// Keys meant for a field stay there
export function typing(event: KeyboardEvent): boolean {
    return event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
}

// A press anywhere else or Escape closes | the element and what floats above it count as inside
export function closeOnOutside(close: () => void): Attachment<HTMLElement> {
    return (root) => {
        const listening = new AbortController()
        const options = { signal: listening.signal }

        // A touch only closes once it lifts, a drag turns into a scroll and cancels it
        let touchOutside = false

        window.addEventListener('pointerdown', (event) => {
            const target = event.target as Element
            if(root.contains(target) || target.closest(FLOATING)) return
            if(event.pointerType === 'mouse') close()
            else touchOutside = true
        }, options)

        window.addEventListener('pointerup', () => {
            if(touchOutside) close()
            touchOutside = false
        }, options)

        window.addEventListener('pointercancel', () => touchOutside = false, options)

        // The editor claims every Escape for itself, so only others that handled it keep this open
        window.addEventListener('keydown', (event) => {
            const handled = event.defaultPrevented && !(event.target as Element).closest('[data-claims-escape]')
            if(event.key !== 'Escape' || handled || floatingOpen()) return
            event.preventDefault()
            close()
        }, options)

        return () => listening.abort()
    }
}
