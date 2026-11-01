import { describe, expect, test } from 'bun:test';
import { describeRule, occurrenceAfter } from '#lib/reminders.ts';

// Rules as the form stores them, in Berlin unless a test says otherwise
const rule = (overrides: Partial<Parameters<typeof occurrenceAfter>[0]>) => ({ at: '2026-10-20T07:00:00.000Z', repeat: 'days' as const, every: 1, weekdays: [], until: '', timezone: 'Europe/Berlin', ...overrides })
const after = (iso: string) => new Date(iso)
const iso = (date: Date | null) => date?.toISOString() ?? null



// ONCE ====================================================================================================
describe('once', () => {
    test('goes off at its time', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'never' }), after('2026-10-01T00:00:00Z')))).toBe('2026-10-20T07:00:00.000Z')
    })

    test('is over once that passed', () => {
        expect(occurrenceAfter(rule({ repeat: 'never' }), after('2026-10-20T07:00:00Z'))).toBeNull()
    })

    test('ignores an end date', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'never', until: '2026-10-01T00:00:00Z' }), after('2026-10-01T00:00:00Z')))).toBe('2026-10-20T07:00:00.000Z')
    })
})



// HOURS ====================================================================================================
describe('hours', () => {
    test('odd steps like 16 hours', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'hours', every: 16 }), after('2026-10-20T07:00:00Z')))).toBe('2026-10-20T23:00:00.000Z')
        expect(iso(occurrenceAfter(rule({ repeat: 'hours', every: 16 }), after('2026-10-21T00:00:00Z')))).toBe('2026-10-21T15:00:00.000Z')
    })
})



// DAYS AND WEEKS ====================================================================================================
describe('days and weeks', () => {
    test('keep the clock time across the end of daylight saving', () => {
        // 9:00 summer time is 7:00 UTC, after October 25 it is 8:00 UTC
        expect(iso(occurrenceAfter(rule({}), after('2026-10-24T08:00:00Z')))).toBe('2026-10-25T08:00:00.000Z')
        expect(iso(occurrenceAfter(rule({}), after('2026-10-30T09:00:00Z')))).toBe('2026-10-31T08:00:00.000Z')
    })

    test('every 3 days', () => {
        expect(iso(occurrenceAfter(rule({ every: 3 }), after('2026-10-20T07:00:00Z')))).toBe('2026-10-23T07:00:00.000Z')
    })

    test('weekly', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'weeks' }), after('2026-10-21T00:00:00Z')))).toBe('2026-10-27T08:00:00.000Z')
    })

    test('end after the last day', () => {
        expect(occurrenceAfter(rule({ until: '2026-10-22T21:59:59.000Z' }), after('2026-10-22T07:00:00Z'))).toBeNull()
        expect(iso(occurrenceAfter(rule({ until: '2026-10-22T21:59:59.000Z' }), after('2026-10-21T07:00:00Z')))).toBe('2026-10-22T07:00:00.000Z')
    })

    test('a start in the future comes first', () => {
        expect(iso(occurrenceAfter(rule({ every: 5 }), after('2026-01-01T00:00:00Z')))).toBe('2026-10-20T07:00:00.000Z')
    })
})



// MONTHS AND YEARS ====================================================================================================
describe('months and years', () => {
    test('the 31st falls back to the last day of shorter months', () => {
        const monthly = rule({ repeat: 'months', at: '2026-01-31T09:00:00Z', timezone: 'UTC' })
        expect(iso(occurrenceAfter(monthly, after('2026-02-01T00:00:00Z')))).toBe('2026-02-28T09:00:00.000Z')
        expect(iso(occurrenceAfter(monthly, after('2026-03-01T00:00:00Z')))).toBe('2026-03-31T09:00:00.000Z')
    })

    test('every 2 months across a year', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'months', every: 2, at: '2026-11-15T09:00:00Z', timezone: 'UTC' }), after('2026-11-16T00:00:00Z')))).toBe('2027-01-15T09:00:00.000Z')
    })

    test('yearly on a leap day', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'years', at: '2028-02-29T09:00:00Z', timezone: 'UTC' }), after('2028-03-01T00:00:00Z')))).toBe('2029-02-28T09:00:00.000Z')
    })
})



// WEEKDAYS ====================================================================================================
describe('weekdays', () => {
    // October 20 2026 is a Tuesday
    test('the start only counts on a picked day', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'weekdays', weekdays: ['th'] }), after('2026-10-01T00:00:00Z')))).toBe('2026-10-22T07:00:00.000Z')
    })

    test('moves on to the next picked day', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'weekdays', weekdays: ['mo', 'fr'] }), after('2026-10-23T08:00:00Z')))).toBe('2026-10-26T08:00:00.000Z')
    })

    test('the same day later on', () => {
        expect(iso(occurrenceAfter(rule({ repeat: 'weekdays', weekdays: ['we'] }), after('2026-10-28T06:00:00Z')))).toBe('2026-10-28T08:00:00.000Z')
    })

    test('no days never goes off', () => {
        expect(occurrenceAfter(rule({ repeat: 'weekdays', weekdays: [] }), after('2026-10-01T00:00:00Z'))).toBeNull()
    })
})



// LABELS ====================================================================================================
describe('describeRule', () => {
    test('names', () => {
        expect(describeRule({ repeat: 'never', every: 1 })).toBe('Once')
        expect(describeRule({ repeat: 'hours', every: 16 })).toBe('Every 16 hours')
        expect(describeRule({ repeat: 'days', every: 1 })).toBe('Daily')
        expect(describeRule({ repeat: 'weekdays', every: 1, weekdays: ['mo', 'tu', 'we', 'th', 'fr'] })).toBe('Weekdays')
        expect(describeRule({ repeat: 'weekdays', every: 1, weekdays: ['fr', 'mo'] })).toBe('Mon, Fri')
    })
})
