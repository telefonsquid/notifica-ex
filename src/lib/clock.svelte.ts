import { createSubscriber } from 'svelte/reactivity';

// NOW | one shared minute tick for relative times, it only runs while something reads it
const subscribe = createSubscriber((update) => {
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
})

export function now(): number {
    subscribe()
    return Date.now()
}
