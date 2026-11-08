import { describe, expect, test } from 'bun:test';
import { autoColorOrder, lastPriority, shownColor } from '#lib/auto_colors.ts';
import { colorName } from '#lib/note_colors.ts';
import { archiveChange, contentOf, emptyNote, estimatedHeight, mergeNotes, sharedContent } from '#lib/notes.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { formatDistance } from '#lib/time_format.ts';
import { noteContentSchema, type Label, type Note, type NoteColor } from '#lib/schemas/notes.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z')
const later = (ms: number) => new Date(NOW + ms).toISOString()
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR

describe('estimatedHeight', () => {
    test('grows with the text, up to the lines a closed card shows', () => {
        const height = (lines: number) => estimatedHeight({ title: '', body: 'a\n'.repeat(lines), images: [], attachments: [] })
        expect(height(5)).toBeGreaterThan(height(1))
        expect(height(5000)).toBe(height(500))
    })

    test('counts wrapped lines, a title and images', () => {
        const plain = estimatedHeight({ title: '', body: 'x', images: [], attachments: [] })
        expect(estimatedHeight({ title: '', body: 'x'.repeat(100), images: [], attachments: [] })).toBeGreaterThan(plain)
        expect(estimatedHeight({ title: 'T', body: 'x', images: [], attachments: [] })).toBeGreaterThan(plain)
        expect(estimatedHeight({ title: '', body: 'x', images: ['a.webp'], attachments: [] })).toBeGreaterThan(plain)
    })
})

describe('sharedContent', () => {
    test('trims and keeps to the size caps', () => {
        const shared = sharedContent(` ${'t'.repeat(LIMITS.NOTE_TITLE + 1)} `, ' body\n')
        expect(shared.title).toHaveLength(LIMITS.NOTE_TITLE)
        expect(shared.body).toBe('body')
    })
})

// Drafts, duplicates and saves all walk these keys | a new content field has to show up in each
describe('note content fields', () => {
    test('contentOf, emptyNote and the schema name the same fields', () => {
        const fields = Object.keys(noteContentSchema.shape).toSorted()
        expect(Object.keys(emptyNote()).toSorted()).toEqual(fields)
        expect(Object.keys(contentOf({ ...emptyNote(), id: 'x', owner: 'y' } as unknown as Note)).toSorted()).toEqual(fields)
    })
})

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

describe('auto colors', () => {
    const label = (id: string, color: NoteColor, colorPriority: number, autoColor = true) => ({ id, name: id, color, autoColor, colorPriority }) as Label
    const order = autoColorOrder([label('low', 'mint', 2), label('off', 'coral', 0, false), label('top', 'cobalt-solid', 1)])

    test('the chart holds auto labels only, highest first', () => {
        expect(order.map((entry) => entry.id)).toEqual(['top', 'low'])
    })

    test('the highest label on the note decides', () => {
        expect(shownColor({ color: '', labels: ['low', 'top'] }, order)).toBe('cobalt-solid')
        expect(shownColor({ color: '', labels: ['low'] }, order)).toBe('mint')
    })

    test('the note\'s own color wins', () => {
        expect(shownColor({ color: 'rose', labels: ['top'] }, order)).toBe('rose')
    })

    test('labels that do not color leave it plain', () => {
        expect(shownColor({ color: '', labels: ['off'] }, order)).toBe('')
        expect(shownColor({ color: '', labels: ['someone elses'] }, order)).toBe('')
    })

    test('the highest decides even when it paints nothing', () => {
        const plainFirst = autoColorOrder([label('plain', '', 0), label('low', 'mint', 1)])
        expect(shownColor({ color: '', labels: ['plain', 'low'] }, plainFirst)).toBe('')
    })

    test('a new label joins below the last one', () => {
        expect(lastPriority(order)).toBe(2)
        expect(lastPriority([])).toBe(-1)
    })
})

describe('archiveChange', () => {
    test('archiving unpins, unarchiving keeps the pin as it was', () => {
        expect(archiveChange({ pinned: true }, true)).toEqual({ archived: true, pinned: false })
        expect(archiveChange({ pinned: true }, false)).toEqual({ archived: false, pinned: true })
    })
})
