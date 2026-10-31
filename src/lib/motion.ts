import { browser } from '$app/env';
import { tick } from 'svelte';
import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';
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

// MORPH | elements named for it in app.css glide to their new place and size while the update lands
export async function morph(update: () => void){
    const root = document.documentElement

    if(!document.startViewTransition || prefersReducedMotion.current){
        update()
        return
    }

    root.dataset.transition = 'morph'
    try {
        await document.startViewTransition(async () => {
            update()
            await tick()
        }).finished
    } finally {
        delete root.dataset.transition
    }
}

// STAGGER | delay for the nth item of a group entering together, capped so long lists don't drag
export function stagger(index: number, step = 45, max = 8): number {
    return Math.min(index, max) * step
}
