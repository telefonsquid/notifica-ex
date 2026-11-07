import { describe, expect, test } from 'bun:test';
import { DEFAULT_LIMITS, effectiveLimits, formatBytes, GB, MB, usedBytes } from './limits.ts';

describe('effectiveLimits', () => {
    test('uses the defaults without overrides', () => {
        expect(effectiveLimits(DEFAULT_LIMITS, null)).toEqual(DEFAULT_LIMITS)
    })

    test('overrides only what was set', () => {
        const limits = effectiveLimits(DEFAULT_LIMITS, { storageBytes: 5 * GB, attachments: false })
        expect(limits.storageBytes).toBe(5 * GB)
        expect(limits.attachments).toBe(false)
        expect(limits.imageBytes).toBe(DEFAULT_LIMITS.imageBytes)
    })
})

describe('usedBytes', () => {
    test('adds up every file on every note', () => {
        expect(usedBytes([
            { fileInfo: { 'a.png': { bytes: 10 }, 'b.zip': { bytes: 20, name: 'b.zip' } } },
            { fileInfo: null },
            {},
            { fileInfo: { 'c.pdf': { bytes: 5 } } }
        ])).toBe(35)
    })
})

describe('formatBytes', () => {
    test('picks a readable unit', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(2048)).toBe('2 KB')
        expect(formatBytes(1.5 * MB)).toBe('1.5 MB')
        expect(formatBytes(100 * MB)).toBe('100 MB')
        expect(formatBytes(GB)).toBe('1 GB')
    })
})
