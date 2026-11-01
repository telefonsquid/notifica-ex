import { describe, expect, test } from 'bun:test';
import type { Note, Reminder } from '#lib/schemas.ts';
import { countActive, emptyFilter, groupReminders, matchesView, readFilter, sortNotes } from '#lib/views.ts';

// A note as pocketbase returns it, with only what a test cares about changed
const note = (overrides: Partial<Note>): Note => ({
    id: 'n', collectionId: 'c', collectionName: 'notes', created: '2026-10-01 10:00:00.000Z', updated: '2026-10-01 10:00:00.000Z',
    owner: 'me', sharedWith: [], images: [], title: '', body: '', color: '', labels: [], pinned: false, archived: false, ...overrides
})

const reminder = (overrides: Partial<Reminder>): Reminder => ({
    id: 'r', collectionId: 'c', collectionName: 'reminders', created: '', updated: '', note: 'n', owner: 'me',
    at: '2026-10-20 07:00:00.000Z', repeat: 'never', every: 1, weekdays: [], until: '', timezone: 'UTC', task: false,
    next: '2026-10-20 07:00:00.000Z', sent: '', done: '', ...overrides
})

const NOW = new Date('2026-10-15T12:00:00Z')
const matches = (item: Note, filter: Partial<ReturnType<typeof emptyFilter>>, reminders: Reminder[] = []) =>
    matchesView(item, { ...emptyFilter(), ...filter }, { reminders: groupReminders(reminders), now: NOW })



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

    test('labels combine as any or all, excluded ones win', () => {
        const both = note({ labels: ['a', 'b'] })
        expect(matches(both, { include: ['a', 'c'] })).toBe(true)
        expect(matches(both, { include: ['a', 'c'], labelMatch: 'all' })).toBe(false)
        expect(matches(both, { include: ['a'], exclude: ['b'] })).toBe(false)
    })

    test('checklist progress leaves out notes without one', () => {
        expect(matches(note({ body: 'plain' }), { list: 'open' })).toBe(false)
        expect(matches(note({ body: '- [ ] a\n- [x] b' }), { list: 'open' })).toBe(true)
        expect(matches(note({ body: '- [x] a' }), { list: 'complete' })).toBe(true)
    })

    test('shared notes', () => {
        expect(matches(note({ sharedWith: ['sam'] }), { shared: 'only' })).toBe(true)
        expect(matches(note({}), { shared: 'only' })).toBe(false)
        expect(matches(note({ sharedWith: ['sam'] }), { shared: 'hide' })).toBe(false)
    })

    test('reminder states', () => {
        const sentTask = reminder({ task: true, sent: '2026-10-14 07:00:00.000Z', next: '2026-10-21 07:00:00.000Z', repeat: 'weeks' })
        expect(matches(note({}), { reminder: 'with' })).toBe(false)
        expect(matches(note({}), { reminder: 'with' }, [reminder({})])).toBe(true)
        expect(matches(note({}), { reminder: 'waiting' }, [sentTask])).toBe(true)
        expect(matches(note({}), { reminder: 'waiting' }, [{ ...sentTask, done: sentTask.sent }])).toBe(false)
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

    test('count the changed fields', () => {
        expect(countActive(emptyFilter())).toBe(0)
        expect(countActive({ ...emptyFilter(), pinned: 'only', words: 'x' })).toBe(2)
    })
})
