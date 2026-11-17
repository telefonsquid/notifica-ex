import { formatAgo, formatDistance } from '#lib/time_format.ts';
import { describe, expect, test } from 'bun:test';

const now = Date.parse('2026-11-17T12:00:00Z')
const at = (offset: number) => new Date(now + offset).toISOString()

describe('formatAgo', () => {

    test.each([
        [-30_000, 'now'],
        [-5 * 60_000, '5 minutes ago'],
        [-12 * 3_600_000, '12 hours ago'],
        [-86_400_000, '1 day ago'],
        [-59.6 * 60_000, '1 hour ago'],
        [-15 * 86_400_000, '2 weeks ago'],
    ])('%d ms reads %s', (offset, text) => {
        expect(formatAgo(at(offset), now)).toBe(text)
    })

    test('an empty time reads nothing', () => {
        expect(formatAgo('', now)).toBe('')
    })

})

describe('formatDistance', () => {

    test.each([
        [3 * 3_600_000, 'in 3 hours'],
        [59.6 * 60_000, 'in 1 hour'],
        [-5 * 60_000, ''],
    ])('%d ms reads %s', (offset, text) => {
        expect(formatDistance(at(offset), now)).toBe(text)
    })

})
