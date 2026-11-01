import { describe, expect, test } from 'bun:test';
import { colorName, formatDistance } from '#lib/notes.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z')
const later = (ms: number) => new Date(NOW + ms).toISOString()
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR

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
