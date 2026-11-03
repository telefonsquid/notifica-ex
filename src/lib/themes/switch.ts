import { syncStatusBar } from '#lib/android.ts';
import { cssEasing, duration } from '#lib/motion.ts';
import { prefersReducedMotion } from 'svelte/motion';
import { setTheme } from '../../routes/api/settings.remote';
import type { ThemeName } from './index';

// SWITCH THEME | the new theme grows as a circle out of the point that triggered it
export async function switchTheme(theme: ThemeName, origin?: { x: number, y: number }){
    const root = document.documentElement

    // PERSIST IN THE BACKGROUND | the switch itself must not wait for the network
    setTheme(theme).catch(() => {})

    const apply = () => {
        root.dataset.theme = theme
        syncStatusBar()
    }

    // NO ANIMATION WITHOUT SUPPORT OR WITH REDUCED MOTION
    if(!document.startViewTransition || prefersReducedMotion.current){
        apply()
        return
    }

    // REVEAL FROM CLICK POINT, OR FROM THE CENTER IF THERE IS NONE
    const x = origin?.x ?? innerWidth / 2
    const y = origin?.y ?? innerHeight / 2
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

    root.dataset.transition = 'theme'
    const transition = document.startViewTransition(apply)

    try {
        await transition.ready
        root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: duration('page') * 1.4, easing: cssEasing('emphasized'), pseudoElement: '::view-transition-new(root)' }
        )
        await transition.finished
    } catch {
        // Skipped by another transition, the theme is applied either way
    } finally {
        delete root.dataset.transition
    }
}
