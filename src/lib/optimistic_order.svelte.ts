import { safeAction } from '#lib/safe_action.ts';

// A list whose moves show at once, the saved order takes over once the server has it | a later move keeps its own order showing
export function optimisticOrder<T extends { id: string }>(saved: () => T[], save: (ids: string[]) => Promise<unknown>) {
    let order = $state.raw<string[] | null>(null)

    const items = $derived.by(() => {
        const list = saved()
        return order ? order.map((id) => list.find((item) => item.id === id)).filter((item) => !!item) : list
    })

    return {
        get items() { return items },

        async move(from: number, to: number) {
            const ids = items.map((item) => item.id)
            ids.splice(to, 0, ...ids.splice(from, 1))

            order = ids
            await safeAction(save(ids))
            if(order === ids) order = null
        },
    }
}
