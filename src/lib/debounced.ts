const WAIT = 400

// Runs a moment after the last call, so walking arrows or typing sends one request
export function debounced(run: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined

    return {
        schedule() {
            clearTimeout(timer)
            timer = setTimeout(() => { timer = undefined; run() }, WAIT)
        },

        // Runs what still waits, for leaving before the wait is over
        flush() {
            if(timer === undefined) return
            clearTimeout(timer)
            timer = undefined
            run()
        },
    }
}
