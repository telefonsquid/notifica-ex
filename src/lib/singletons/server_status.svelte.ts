import { invalidateAll } from '$app/navigation';
import { resolve } from '$app/paths';

const POLL = 30_000
const POLL_WHILE_DOWN = 5_000

let down = $state(false)
let watching = false
let timer: ReturnType<typeof setTimeout> | undefined

export const serverStatus = {
    get down(){ return down }
}

// CHECK | also after a failed call, returns whether the server answers
export async function checkServer(): Promise<boolean> {
    clearTimeout(timer)

    const wasDown = down
    const answer = await fetch(resolve('/api/health'), { cache: 'no-store', signal: AbortSignal.timeout(8000) }).catch(() => null)
    down = !answer?.ok

    if(wasDown && !down) invalidateAll() // Whatever changed meanwhile, and a page that could not load
    if(watching) timer = setTimeout(pollWhenVisible, down ? POLL_WHILE_DOWN : POLL)

    return !down
}

// A hidden tab stays quiet, showing it again checks at once
function pollWhenVisible(){
    if(!document.hidden) checkServer()
}

// WATCH | from the root layout, returns the stop
export function watchServer(): () => void {
    watching = true
    checkServer()

    document.addEventListener('visibilitychange', pollWhenVisible)
    window.addEventListener('online', pollWhenVisible)
    window.addEventListener('offline', pollWhenVisible)

    return () => {
        watching = false
        clearTimeout(timer)
        document.removeEventListener('visibilitychange', pollWhenVisible)
        window.removeEventListener('online', pollWhenVisible)
        window.removeEventListener('offline', pollWhenVisible)
    }
}
