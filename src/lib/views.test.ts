import { describe, expect, test } from 'bun:test';
import type { Label, Note } from '#lib/schemas/notes.ts';
import type { Reminder } from '#lib/schemas/reminders.ts';
import { viewFilterSchema, viewSortSchema } from '#lib/schemas/views.ts';
import { readFilter } from '#lib/server/views.ts';
import { positionBetween, positionOf } from '#lib/note_position.ts';
import { groupReminders } from '#lib/reminders.ts';
import { countActive, countAdvancedOnly, defaultSort, emptyFilter, flipToggle, isToggled, matchesView, noteDefaults, sortNotes } from '#lib/views.ts';

// A note as pocketbase returns it, with only what a test cares about changed
const note = (overrides: Partial<Note>): Note => ({
    id: 'n', collectionId: 'c', collectionName: 'notes', created: '2026-10-01 10:00:00.000Z', updated: '2026-10-01 10:00:00.000Z',
    owner: 'me', shared: [], position: 0, images: [], attachments: [], fileInfo: null, sealed: '', title: '', body: '', color: '', labels: [], pinned: false, archived: false, ...overrides
})

const reminder = (overrides: Partial<Reminder>): Reminder => ({
    id: 'r', collectionId: 'c', collectionName: 'reminders', created: '', updated: '', note: 'n', owner: 'me',
    at: '2026-10-20 07:00:00.000Z', repeat: 'never', every: 1, weekdays: [], until: '', timezone: 'UTC', task: false, rules: [],
    next: '2026-10-20 07:00:00.000Z', open: 0, ...overrides
})

const NOW = new Date('2026-10-15T12:00:00Z')
const matches = (item: Note, filter: Partial<ReturnType<typeof emptyFilter>>, reminders: Reminder[] = [], autoColors: Label[] = []) =>
    matchesView(item, { ...emptyFilter(), ...filter }, { reminders: groupReminders(reminders), now: NOW, autoColors })



// FILTERS ====================================================================================================
describe('filters', () => {
    test('archived notes stay hidden by default', () => {
        expect(matches(note({ archived: true }), {})).toBe(false)
        expect(matches(note({ archived: true }), { archived: 'only' })).toBe(true)
    })

    test('words must all appear, left out ones must not', () => {
        const groceries = note({ title: 'Groceries', body: 'Milk and bread' })
        expect(matches(groceries, { words: 'milk BREAD' })).toBe(true)
        expect(matches(groceries, { words: 'milk eggs' })).toBe(false)
        expect(matches(groceries, { without: 'bread' })).toBe(false)
        expect(matches(groceries, { words: 'milk', titleOnly: true })).toBe(false)
    })

    test('match case tells Milk from milk', () => {
        const groceries = note({ title: 'Groceries', body: 'Milk and bread' })
        expect(matches(groceries, { words: 'Milk', matchCase: true })).toBe(true)
        expect(matches(groceries, { words: 'milk', matchCase: true })).toBe(false)
        expect(matches(groceries, { without: 'BREAD', matchCase: true })).toBe(true)
    })

    test('labels combine as any or all, excluded ones win', () => {
        const both = note({ labels: ['a', 'b'] })
        expect(matches(both, { include: ['a', 'c'] })).toBe(true)
        expect(matches(both, { include: ['a', 'c'], labelMatch: 'all' })).toBe(false)
        expect(matches(both, { include: ['a'], exclude: ['b'] })).toBe(false)
    })

    test('a color filter sees what the auto color label paints', () => {
        const painted = note({ labels: ['a'] })
        const chart = [{ id: 'a', color: 'mint' }] as Label[]
        expect(matches(painted, { colors: ['mint'] }, [], chart)).toBe(true)
        expect(matches(painted, { colors: ['mint'] })).toBe(false)
        expect(matches(note({ color: 'rose', labels: ['a'] }), { colors: ['mint'] }, [], chart)).toBe(false)
    })

    test('checklist progress leaves out notes without one', () => {
        expect(matches(note({ body: 'plain' }), { list: 'open' })).toBe(false)
        expect(matches(note({ body: '- [ ] a\n- [x] b' }), { list: 'open' })).toBe(true)
        expect(matches(note({ body: '- [x] a' }), { list: 'complete' })).toBe(true)
    })

    test('reminder states', () => {
        const sentTask = reminder({ task: true, open: 1, next: '2026-10-21 07:00:00.000Z', repeat: 'weeks' })
        expect(matches(note({}), { reminder: 'with' })).toBe(false)
        expect(matches(note({}), { reminder: 'with' }, [reminder({})])).toBe(true)
        expect(matches(note({}), { reminder: 'waiting' }, [sentTask])).toBe(true)
        expect(matches(note({}), { reminder: 'waiting' }, [{ ...sentTask, open: 0 }])).toBe(false)
        expect(matches(note({}), { reminder: 'finished' }, [reminder({ next: '' })])).toBe(true)
    })

    test('dates look back from now, due dates ahead', () => {
        expect(matches(note({ created: '2026-10-10 10:00:00.000Z' }), { created: { mode: 'within', amount: 7, unit: 'days', from: '', to: '' } })).toBe(true)
        expect(matches(note({ created: '2026-10-01 10:00:00.000Z' }), { created: { mode: 'within', amount: 7, unit: 'days', from: '', to: '' } })).toBe(false)
        expect(matches(note({}), { due: { mode: 'within', amount: 1, unit: 'weeks', from: '', to: '' } }, [reminder({ next: '2026-10-20 07:00:00.000Z' })])).toBe(true)
        expect(matches(note({}), { due: { mode: 'within', amount: 2, unit: 'days', from: '', to: '' } }, [reminder({ next: '2026-10-20 07:00:00.000Z' })])).toBe(false)
    })
})



// SORTING ====================================================================================================
describe('sorting', () => {
    const a = note({ id: 'a', title: 'Apples', updated: '2026-10-03 10:00:00.000Z' })
    const b = note({ id: 'b', title: 'Bananas', updated: '2026-10-02 10:00:00.000Z', pinned: true })
    const c = note({ id: 'c', title: '', updated: '2026-10-01 10:00:00.000Z' })
    const ids = (notes: Note[]) => notes.map((item) => item.id).join('')

    test('pinned first, then newest', () => {
        expect(ids(sortNotes([a, b, c], { by: 'updated', direction: 'desc', pinnedFirst: true }, new Map()))).toBe('bac')
    })

    test('titles, untitled ones last', () => {
        expect(ids(sortNotes([c, b, a], { by: 'title', direction: 'asc', pinnedFirst: false }, new Map()))).toBe('abc')
    })

    test('next reminder, notes without one last either way', () => {
        const reminders = groupReminders([reminder({ id: '1', note: 'a', next: '2026-10-22 07:00:00.000Z' }), reminder({ id: '2', note: 'c', next: '2026-10-21 07:00:00.000Z' })])
        expect(ids(sortNotes([a, b, c], { by: 'reminder', direction: 'asc', pinnedFirst: false }, reminders))).toBe('cab')
        expect(ids(sortNotes([a, b, c], { by: 'reminder', direction: 'desc', pinnedFirst: false }, reminders))).toBe('acb')
    })
})



// SAVED FILTERS ====================================================================================================
describe('saved filters', () => {
    test('older ones get the fields added since', () => {
        expect(readFilter({ words: 'x' })).toEqual({ ...emptyFilter(), words: 'x' })
        expect(readFilter({ archived: 'nonsense' })).toEqual(emptyFilter())
    })

    test('defaults match the schemas, key order included since filters compare as JSON', () => {
        expect(JSON.stringify(emptyFilter())).toBe(JSON.stringify(viewFilterSchema.parse({})))
        expect(JSON.stringify(defaultSort())).toBe(JSON.stringify(viewSortSchema.parse({})))
    })

    test('count the changed fields', () => {
        expect(countActive(emptyFilter())).toBe(0)
        expect(countActive({ ...emptyFilter(), pinned: 'only', words: 'x' })).toBe(2)
    })
})



// MANUAL ORDER AND NEW NOTES ====================================================================================================
describe('manual order', () => {
    const at = (position: number) => note({ position })

    test('a drop lands between its neighbours either way the sort runs', () => {
        for(const position of [positionBetween(at(300), at(100), 'desc'), positionBetween(at(100), at(300), 'asc')]){
            expect(position).toBeGreaterThan(100)
            expect(position).toBeLessThan(300)
        }
    })

    test('the ends move past the last neighbour', () => {
        expect(positionBetween(at(300), undefined, 'desc')).toBeLessThan(300)
        expect(positionBetween(undefined, at(300), 'desc')).toBeGreaterThan(300)
    })

    test('notes never moved sort by when they were made', () => {
        expect(positionOf(note({ position: 0, created: '2026-10-01 10:00:00.000Z' }))).toBe(Date.parse('2026-10-01T10:00:00Z'))
    })
})

describe('new notes in a view', () => {
    test('take what the view demands', () => {
        expect(noteDefaults({ ...emptyFilter(), include: ['a'], colors: ['mint'], pinned: 'only' })).toEqual({ color: 'mint', labels: ['a'], pinned: true, archived: false })
    })

    test('several labels any of which would do pick none', () => {
        expect(noteDefaults({ ...emptyFilter(), include: ['a', 'b'] }).labels).toEqual([])
        expect(noteDefaults({ ...emptyFilter(), include: ['a', 'b'], labelMatch: 'all' }).labels).toEqual(['a', 'b'])
    })
})

describe('simple toggles', () => {
    test('a toggle turns its one value on and back to none', () => {
        const on = { ...emptyFilter(), ...flipToggle(emptyFilter(), 'reminder') }
        expect(on.reminder).toBe('with')
        expect(isToggled(on, 'reminder')).toBe(true)
        expect(flipToggle(on, 'reminder')).toEqual({ reminder: 'any' })
    })

    test('what a toggle sets stays visible in the simple editor', () => {
        for(const field of ['pinned', 'reminder', 'list'] as const){
            expect(countAdvancedOnly({ ...emptyFilter(), ...flipToggle(emptyFilter(), field) })).toBe(0)
        }
    })
})
