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
    blur?: number                       // px of starting blur
}

// RISE | fades in from slightly below, comes into focus while it settles
export function rise(_node: Element, options: RiseOptions = {}): TransitionConfig {
    const { delay = 0, y = 12, scale = 0.98, blur = 6 } = options

    return {
        delay: prefersReducedMotion.current ? 0 : delay,
        duration: duration(options.duration ?? 'slow'),
        easing: easing(options.easing ?? 'out'),
        css: (t, u) => `
            opacity: ${t};
            transform: translateY(${u * y}px) scale(${scale + (1 - scale) * t});
            filter: blur(${u * blur}px);
        `
    }
}

// SINK | the faster counterpart for leaving, so exits never hold up what comes next
export function sink(_node: Element, options: RiseOptions = {}): TransitionConfig {
    const { delay = 0, y = 6, scale = 0.96, blur = 4 } = options

    return {
        delay: prefersReducedMotion.current ? 0 : delay,
        duration: duration(options.duration ?? 'fast'),
        easing: easing(options.easing ?? 'in'),
        css: (t, u) => `
            opacity: ${t};
            transform: translateY(${u * y}px) scale(${scale + (1 - scale) * t});
            filter: blur(${u * blur}px);
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
            const style = getComputedStyle(node)
            const frame = node.offsetHeight - node.clientHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
            const to = content.offsetHeight + frame

            // A running morph starts over from wherever it is now and still ends when it would have
            const from = running ? node.getBoundingClientRect().height : last
            const left = running ? Number(running.effect?.getComputedTiming().endTime) - Number(running.currentTime) : Infinity
            last = to
            running?.cancel()
            running = undefined
            const options = timing()
            if(!from || Math.abs(from - to) < 1 || !options?.duration) return

            const time = Math.max(Math.min(options.duration, Number.isNaN(left) ? Infinity : left), duration('fast'))
            running = node.animate({ height: [`${from}px`, `${to}px`], overflow: ['clip', 'clip'] }, { ...options, duration: time })
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
function withoutLeaving<T>(root: ParentNode, read: () => T): T {
    const leaving = [...root.querySelectorAll<HTMLElement>('[data-flip] [inert]')]
    leaving.forEach((node) => node.style.display = 'none')
    const result = read()
    leaving.forEach((node) => node.style.display = '')
    return result
}

// GLIDE | cells move from where they were to where the update put them | data-flip-body marks the part inside that resizes
export function glide(root: ParentNode, before: Map<string, DOMRect>){
    const time = duration('slow')
    const timing = { duration: time, easing: cssEasing('emphasized') }

    // Glides still running would skew the new rects
    const cells = [...root.querySelectorAll<HTMLElement>('[data-flip]')]
    cells.forEach(settle)
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

        const animations = [cell.animate({ translate: [`${dx}px ${dy}px`, '0 0'] }, timing)]

        // The cell keeps its final size for the grid while its content grows or shrinks inside, so text reflows instead of stretching
        if(resized){
            const body = bodyOf(cell)
            cell.style.height = `${heights.get(cell)}px`
            cell.style.zIndex = '1'
            body.dataset.resizing = ''
            animations.push(body.animate({ width: [`${from.width}px`, `${to.width}px`], height: [`${from.height}px`, `${to.height}px`] }, timing))
        }

        running.set(cell, animations)
        Promise.all(animations.map((animation) => animation.finished)).then(() => settle(cell), () => {})
    }
}

const running = new WeakMap<HTMLElement, Animation[]>()

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
