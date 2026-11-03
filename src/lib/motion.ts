import { browser } from '$app/env';
import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';
import type { Attachment } from 'svelte/attachments';
import type { TransitionConfig } from 'svelte/transition';

/*
    Durations and easings live as CSS tokens in app.css. This module reads them back,
    so CSS animations and Svelte transitions always move with the same timing.
*/



// TOKENS ====================================================================================================
export type DurationToken = 'instant' | 'fast' | 'base' | 'slow' | 'page'
export type EasingToken = 'out' | 'in' | 'in-out' | 'emphasized' | 'spring'

// FALLBACKS | used during SSR and if a token is missing
const FALLBACK_DURATIONS: Record<DurationToken, number> = { instant: 90, fast: 160, base: 280, slow: 460, page: 560 }
const FALLBACK_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

function readToken(name: string): string {
    if(!browser) return ''
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// DURATION IN MS | zero when the user asked for reduced motion
export function duration(token: DurationToken): number {
    if(prefersReducedMotion.current) return 0

    const value = readToken(`--duration-${token}`)
    const parsed = value.endsWith('ms') ? parseFloat(value) : value.endsWith('s') ? parseFloat(value) * 1000 : NaN
    return Number.isFinite(parsed) ? parsed : FALLBACK_DURATIONS[token]
}

// RAW CSS EASING | for the Web Animations API, which takes the string as is
export function cssEasing(token: EasingToken): string {
    return readToken(`--ease-${token}`) || FALLBACK_EASING
}

// EASING AS FUNCTION | for Svelte transitions, cached since parsing runs per frame otherwise
const easingCache = new Map<string, (t: number) => number>()

export function easing(token: EasingToken): (t: number) => number {
    const css = cssEasing(token)

    const cached = easingCache.get(css)
    if(cached) return cached

    const points = css.match(/cubic-bezier\(([^)]+)\)/)?.[1].split(',').map(Number)
    const fn = points?.length === 4 && points.every(Number.isFinite) ? cubicBezier(points[0], points[1], points[2], points[3]) : cubicOut
    easingCache.set(css, fn)
    return fn
}



// CUBIC BEZIER ====================================================================================================
// Same curve the browser draws for cubic-bezier(x1, y1, x2, y2)
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {

    // Polynomial coefficients of one axis
    const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1
    const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1

    const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
    const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
    const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx

    // Find the curve position for a given x, Newton first and bisection if the slope is too flat
    function solveX(x: number): number {
        let s = x
        for(let i = 0; i < 8; i++){
            const error = sampleX(s) - x
            if(Math.abs(error) < 1e-6) return s
            const slope = slopeX(s)
            if(Math.abs(slope) < 1e-6) break
            s -= error / slope
        }

        let low = 0, high = 1
        s = x
        while(high - low > 1e-6){
            if(sampleX(s) < x) low = s
            else high = s
            s = (low + high) / 2
        }
        return s
    }

    return (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t))
}



// TRANSITIONS ====================================================================================================
type RiseOptions = {
    delay?: number
    duration?: DurationToken
    easing?: EasingToken
    y?: number                          // px the element travels
    scale?: number                      // starting scale
}

// RISE | fades in from slightly below
export function rise(_node: Element, options: RiseOptions = {}): TransitionConfig {
    const { delay = 0, y = 12, scale = 0.98 } = options

    return {
        delay: prefersReducedMotion.current ? 0 : delay,
        duration: duration(options.duration ?? 'slow'),
        easing: easing(options.easing ?? 'out'),
        css: (t, u) => `
            opacity: ${t};
            transform: translateY(${u * y}px) scale(${scale + (1 - scale) * t});
        `
    }
}

// SINK | the faster counterpart for leaving, so exits never hold up what comes next
export function sink(_node: Element, options: RiseOptions = {}): TransitionConfig {
    const { delay = 0, y = 6, scale = 0.96 } = options

    return {
        delay: prefersReducedMotion.current ? 0 : delay,
        duration: duration(options.duration ?? 'fast'),
        easing: easing(options.easing ?? 'in'),
        css: (t, u) => `
            opacity: ${t};
            transform: translateY(${u * y}px) scale(${scale + (1 - scale) * t});
        `
    }
}

type UnfoldOptions = {
    axis?: 'x' | 'y'                    // y grows downwards, x sideways in a row
    delay?: number
    duration?: DurationToken
}

// UNFOLD | grows from nothing to its own size while it fades in, so its neighbours move along instead of jumping
// The easing is symmetric, so one unfolding while another folds keeps their sum steady
export function unfold(node: Element, options: UnfoldOptions = {}): TransitionConfig {
    const { axis = 'y', delay = 0 } = options
    const [size, start, end] = axis === 'y' ? ['height', 'top', 'bottom'] : ['width', 'left', 'right']
    const style = getComputedStyle(node)
    const read = (property: string) => parseFloat(style.getPropertyValue(property)) || 0

    const full = read(size)
    const opacity = parseFloat(style.opacity)     // a leaving element may have faded already
    const padding = [read(`padding-${start}`), read(`padding-${end}`)]
    const margin = [read(`margin-${start}`), read(`margin-${end}`)]

    // The gap of a flex parent stays even at zero size | a negative margin takes it back meanwhile
    const parent = node.parentElement && getComputedStyle(node.parentElement)
    const gap = parent?.display.includes('flex') ? parseFloat(axis === 'y' ? parent.rowGap : parent.columnGap) || 0 : 0

    return {
        delay: prefersReducedMotion.current ? 0 : delay,
        duration: duration(options.duration ?? 'base'),
        easing: easing('in-out'),
        css: (t, u) => `
            overflow: hidden;
            opacity: ${t * t * opacity};
            ${size}: ${t * full}px;
            padding-${start}: ${t * padding[0]}px;
            padding-${end}: ${t * padding[1]}px;
            margin-${start}: ${t * margin[0]}px;
            margin-${end}: ${t * margin[1] - u * gap}px;
        `
    }
}

// EMERGE | a dialog panel grows out of the button that opened it and shrinks back into it
export function emerge(node: Element, { anchor, leaving = false }: { anchor?: HTMLElement | null, leaving?: boolean } = {}): TransitionConfig {
    const panel = node.getBoundingClientRect()
    const button = anchor?.isConnected && !prefersReducedMotion.current ? anchor.getBoundingClientRect() : null
    const dx = button ? button.left + button.width / 2 - (panel.left + panel.width / 2) : 0
    const dy = button ? button.top + button.height / 2 - (panel.top + panel.height / 2) : 12

    return {
        duration: duration(leaving ? 'base' : 'slow'),
        easing: easing(leaving ? 'in' : 'emphasized'),
        css: (t, u) => `
            opacity: ${Math.min(1, t * 2)};
            transform: translate(${u * dx}px, ${u * dy}px) scale(${0.3 + 0.7 * t});
        `
    }
}

// MORPH | the node follows its first child's height smoothly, so a swap inside never pops
// The child keeps its natural size, the node animates between the old and new one around it
// Timing comes per change, so it can match whatever moves around the node | null jumps
export function morph(timing: () => { duration: number, easing: string } | null): Attachment<HTMLElement> {
    return (node) => {
        const content = node.firstElementChild as HTMLElement | null
        if(!content) return

        let last = 0
        let running: Animation | undefined

        const observer = new ResizeObserver(() => {
            // A running morph starts over from wherever it is now and still ends when it would have
            const from = running ? node.getBoundingClientRect().height : last
            const left = running ? Number(running.effect?.getComputedTiming().endTime) - Number(running.currentTime) : Infinity
            running?.cancel()
            running = undefined

            // The height the layout grants, a capped scroll area stops short of its content
            const to = node.getBoundingClientRect().height
            last = to
            const options = timing()
            if(!from || Math.abs(from - to) < 1 || !options?.duration) return

            // Scroll areas keep scrolling, clipping one resets its position and toggles the scrollbar
            const clip = getComputedStyle(node).overflowY === 'visible' ? { overflow: ['clip', 'clip'] } : {}
            const time = Math.max(Math.min(options.duration, Number.isNaN(left) ? Infinity : left), duration('fast'))
            running = node.animate({ height: [`${from}px`, `${to}px`], ...clip }, { ...options, duration: time })
            const own = running
            own.finished.then(() => { if(running === own) running = undefined }, () => {})
        })
        observer.observe(content)

        return () => {
            observer.disconnect()
            running?.cancel()
        }
    }
}


// STAGGER | delay for the nth item of a group entering together, capped so long lists don't drag
export function stagger(index: number, step = 45, max = 8): number {
    return Math.min(index, max) * step
}



// RELAYOUT ====================================================================================================
// Rects of every cell marked with data-flip, keyed by its value | taken before an update, mid glide too
export function measure(root: ParentNode): Map<string, DOMRect> {
    const cells = root.querySelectorAll<HTMLElement>('[data-flip]')
    return withoutLeaving(root, () => new Map([...cells].map((cell) => [cell.dataset.flip!, bodyOf(cell).getBoundingClientRect()])))
}

// Svelte makes leaving elements inert until their outro ends, so their space counts as gone already
export function withoutLeaving<T>(root: ParentNode, read: () => T): T {
    const leaving = [...root.querySelectorAll<HTMLElement>('[data-flip] [inert]')]
    leaving.forEach((node) => node.style.display = 'none')
    const result = read()
    leaving.forEach((node) => node.style.display = '')
    return result
}

// GLIDE | cells move from where they were to where the update put them | data-flip-body marks the part inside that resizes
// Layout runs once the cells hold their natural size, before the new rects are read
export function glide(root: ParentNode, before: Map<string, DOMRect>, layout?: () => void){
    const time = duration('slow')
    const timing = { duration: time, easing: cssEasing('emphasized') }

    // Glides still running would skew the new rects | a dragged cell follows the pointer instead
    const cells = [...root.querySelectorAll<HTMLElement>('[data-flip]:not([data-dragging])')]
    cells.forEach(settle)
    layout?.()
    if(!time) return
    const after = measure(root)
    const heights = withoutLeaving(root, () => new Map(cells.map((cell) => [cell, cell.getBoundingClientRect().height])))

    for(const cell of cells){
        const from = before.get(cell.dataset.flip!)
        const to = after.get(cell.dataset.flip!)
        if(!from || !to) continue

        const dx = from.left - to.left, dy = from.top - to.top
        const resized = Math.abs(from.width - to.width) > 1 || Math.abs(from.height - to.height) > 1
        if(Math.abs(dx) < 1 && Math.abs(dy) < 1 && !resized) continue
        if(!resized && offscreen(from) && offscreen(to)) continue           // Unseen glides only cost frames on phones

        const translate = [`${dx}px ${dy}px`, '0 0']
        const animations: Animation[] = []

        // The cell keeps its final size for the grid while its content grows or shrinks inside, so text reflows instead of stretching
        // Only the body travels then, the full size cell far from its spot would stretch the page and add scrollbars
        if(resized){
            const body = bodyOf(cell)
            cell.style.height = `${heights.get(cell)}px`
            cell.style.zIndex = '1'
            body.dataset.resizing = ''
            animations.push(body.animate({ translate, width: [`${from.width}px`, `${to.width}px`], height: [`${from.height}px`, `${to.height}px`] }, timing))
        }
        else animations.push(cell.animate({ translate }, timing))

        running.set(cell, animations)
        Promise.all(animations.map((animation) => animation.finished)).then(() => settle(cell), () => {})
    }
}

const running = new WeakMap<HTMLElement, Animation[]>()

function offscreen(rect: DOMRect){
    return rect.bottom < 0 || rect.top > innerHeight
}

function settle(cell: HTMLElement){
    running.get(cell)?.forEach((animation) => animation.cancel())
    running.delete(cell)
    cell.style.height = ''
    cell.style.zIndex = ''
    delete bodyOf(cell).dataset.resizing
}

// The part that changes size, the cell itself when nothing inside is marked
function bodyOf(cell: HTMLElement): HTMLElement {
    return cell.querySelector<HTMLElement>('[data-flip-body]') ?? cell
}
