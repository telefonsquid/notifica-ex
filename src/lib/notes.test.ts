import { describe, expect, test } from 'bun:test';
import { colorName, formatDistance, mergeNotes } from '#lib/notes.ts';
import type { Note } from '#lib/schemas.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z')
const later = (ms: number) => new Date(NOW + ms).toISOString()
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR

describe('mergeNotes', () => {
    const note = (id: string, updated: string, title = '') => ({ id, updated, title }) as Note
    const list = [note('a', '2026-10-01 10:00:00.000Z'), note('b', '2026-10-01 10:00:00.000Z')]

    test('replaces a note in its place', () => {
        const merged = mergeNotes(list, [{ action: 'update', record: note('a', '2026-10-01 11:00:00.000Z', 'new') }])
        expect(merged.map((item) => item.id)).toEqual(['a', 'b'])
        expect(merged[0].title).toBe('new')
    })

    test('adds an unknown note', () => {
        expect(mergeNotes(list, [{ action: 'create', record: note('c', '2026-10-01 10:00:00.000Z') }])).toHaveLength(3)
    })

    test('an older answer loses to what the list holds', () => {
        const merged = mergeNotes(list, [{ action: 'update', record: note('a', '2026-10-01 09:00:00.000Z', 'old') }])
        expect(merged[0].title).toBe('')
    })

    test('a burst applies in order, a delete removes', () => {
        const merged = mergeNotes(list, [
            { action: 'update', record: note('a', '2026-10-01 11:00:00.000Z', 'new') },
            { action: 'delete', record: note('a', '2026-10-01 11:00:00.000Z') },
            { action: 'create', record: note('c', '2026-10-01 11:00:00.000Z') }
        ])
        expect(merged.map((item) => item.id)).toEqual(['b', 'c'])
    })
})

describe('formatDistance', () => {
    test('largest unit that fits', () => {
        expect(formatDistance(later(5 * MINUTE), NOW)).toBe('in 5 minutes')
        expect(formatDistance(later(3 * HOUR), NOW)).toBe('in 3 hours')
        expect(formatDistance(later(2 * DAY), NOW)).toBe('in 2 days')
    })

    test('rounding up moves on to the next unit', () => {
        expect(formatDistance(later(59.6 * MINUTE), NOW)).toBe('in 1 hour')
        expect(formatDistance(later(6.6 * DAY), NOW)).toBe('in 1 week')
    })

    test('now, and nothing once it passed', () => {
        expect(formatDistance(later(30_000), NOW)).toBe('now')
        expect(formatDistance(later(-5 * MINUTE), NOW)).toBe('')
        expect(formatDistance('', NOW)).toBe('')
    })
})

describe('colorName', () => {
    test('reads as words', () => {
        expect(colorName('')).toBe('Plain')
        expect(colorName('cobalt-solid')).toBe('Cobalt solid')
    })
})
