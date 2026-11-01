/*
    How many server actions are on their way. The progress bar in the root layout runs while any is
    and it takes long enough to wonder about.
*/

export const busy = $state({ actions: 0 })

export async function track<T>(promise: Promise<T>): Promise<T> {
    busy.actions++
    try {
        return await promise
    } finally {
        busy.actions--
    }
}
