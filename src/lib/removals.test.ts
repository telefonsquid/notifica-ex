import { removalQueue, type RemovedNote } from '#lib/removals.ts';
import { describe, expect, test } from 'bun:test';

const NOTE = { id: 'a', owner: 'me' }

// A queue with its outside world written down, the answer decides how the server responds
function setup(answer: unknown = true) {
    const hidden = new Set<string>()
    const toasts = new Map<number, { undo: () => void, end: () => void }>()
    const removed: string[] = []
    const dropped: string[] = []
    const sent: string[] = []

    const queue = removalQueue({
        hidden,
        toast(_notes, _me, undo, end) {
            toasts.set(toasts.size + 1, { undo, end })
            return toasts.size
        },
        dismiss(toast) {
            toasts.get(toast)?.end()
        },
        async remove(note: RemovedNote) {
            removed.push(note.id)
            return answer
        },
        drop: (notes) => dropped.push(...notes.map((note) => note.id)),
        send: (notes) => sent.push(...notes.map((note) => note.id)),
    })
    return { queue, hidden, toasts, removed, dropped, sent }
}

describe('a note on its way out', () => {
    test('hides at once, the server hears of it when the toast ends', async () => {
        const { queue, hidden, toasts, removed, dropped } = setup()
        queue.add([NOTE], 'me')
        expect(hidden.has('a')).toBe(true)
        expect(removed).toEqual([])

        toasts.get(1)!.end()
        await Bun.sleep(0)
        expect(removed).toEqual(['a'])
        expect(dropped).toEqual(['a'])
        expect(hidden.has('a')).toBe(false)
    })

    test('Undo brings it back and the server hears nothing', async () => {
        const { queue, hidden, toasts, removed, dropped } = setup()
        queue.add([NOTE], 'me')

        toasts.get(1)!.undo()
        toasts.get(1)!.end()
        await Bun.sleep(0)
        expect(hidden.has('a')).toBe(false)
        expect(removed).toEqual([])
        expect(dropped).toEqual([])
    })

    test('one the server refused comes back into view', async () => {
        const { queue, hidden, toasts, dropped } = setup(null)
        queue.add([NOTE], 'me')

        toasts.get(1)!.end()
        await Bun.sleep(0)
        expect(dropped).toEqual([])
        expect(hidden.has('a')).toBe(false)
    })

    test('finishing all of them sends each once', async () => {
        const { queue, removed } = setup()
        queue.add([NOTE], 'me')

        await queue.finishAll()
        expect(removed).toEqual(['a'])
    })
})

describe('a page that goes while a toast is up', () => {
    test('sends it once, the toast ending later changes nothing', async () => {
        const { queue, toasts, removed, sent } = setup()
        queue.add([NOTE], 'me')

        queue.leave()
        toasts.get(1)!.end()
        await Bun.sleep(0)
        expect(sent).toEqual(['a'])
        expect(removed).toEqual([])
    })

    test('coming back out of the cache ends the toast and the note stays gone', () => {
        const { queue, hidden, removed, dropped } = setup()
        queue.add([NOTE], 'me')

        queue.leave()
        queue.back()
        expect(dropped).toEqual(['a'])
        expect(hidden.has('a')).toBe(false)
        expect(removed).toEqual([])
    })

    test('nothing waiting sends nothing', () => {
        const { queue, sent } = setup()
        queue.leave()
        expect(sent).toEqual([])
    })
})
