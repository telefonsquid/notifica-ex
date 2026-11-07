import { describe, expect, test } from 'bun:test';
import { describeRule, firstOccurrence, isDue, movedOn, occurrenceAfter, snoozeUntil } from '#lib/reminders.ts';

// Rules as the form stores them, in Berlin unless a test says otherwise
const rule = (overrides: Partial<Parameters<typeof occurrenceAfter>[0]>) => ({ at: '2026-10-20T07:00:00.000Z', repeat: 'days' as const, every: 1, weekdays: [], until: '', timezone: 'Europe/Berlin', ...overrides })
const after = (iso: string) => new Date(iso)
const iso = (date: Date | null) => date?.toISOString() ?? null



// DISPATCH ====================================================================================================
describe('a reminder changed during a dispatch run', () => {
    const now = after('2026-10-20T07:00:30Z')
    const wentOff = { next: '2026-10-20 07:00:00.000Z' }

    test('moves on when nothing happened meanwhile', () => {
        expect(movedOn(wentOff, { ...rule({}), ...wentOff }, now)).toBe('2026-10-21T07:00:00.000Z')
    })

    test('a once reminder finishes', () => {
        expect(movedOn(wentOff, { ...rule({ repeat: 'never' }), ...wentOff }, now)).toBe('')
    })

    test('a snooze or edit stands, also on a once reminder', () => {
        expect(movedOn(wentOff, { ...rule({}), next: '2026-10-20 08:00:00.000Z' }, now)).toBeNull()
        expect(movedOn(wentOff, { ...rule({ repeat: 'never' }), next: '2026-10-20 08:00:00.000Z' }, now)).toBeNull()
    })

    test('a deleted one writes nothing', () => {
        expect(movedOn(wentOff, null, now)).toBeNull()
    })

    test('a changed rule counts from the new rule', () => {
        expect(movedOn(wentOff, { ...rule({ every: 2 }), ...wentOff }, now)).toBe('2026-10-22T07:00:00.000Z')
    })

    test('one moved to later or finished is no longer due', () => {
        expect(isDue({ next: '2026-10-20 08:00:00.000Z' }, now)).toBe(false)
        expect(isDue({ next: '' }, now)).toBe(false)
        expect(isDue(wentOff, now)).toBe(true)
    })
})



// SNOOZE ====================================================================================================
describe('snooze', () => {
    test('an hour is an hour, also across a clock change', () => {
        expect(iso(snoozeUntil('hour', after('2026-10-25T00:30:00Z'), 'Europe/Berlin'))).toBe('2026-10-25T01:30:00.000Z')
    })

    test('tomorrow is 9:00 in the zone of the reminder', () => {
        expect(iso(snoozeUntil('tomorrow', after('2026-11-07T12:00:00Z'), 'Europe/Berlin'))).toBe('2026-11-08T08:00:00.000Z')
        expect(iso(snoozeUntil('tomorrow', after('2026-11-07T12:00:00Z'), 'America/New_York'))).toBe('2026-11-08T14:00:00.000Z')
    })

    test('the day counts in that zone, not in utc', () => {
        expect(iso(snoozeUntil('tomorrow', after('2026-11-07T23:30:00Z'), 'Asia/Tokyo'))).toBe('2026-11-09T00:00:00.000Z')
    })

    test('tomorrow keeps 9:00 across a clock change', () => {
        expect(iso(snoozeUntil('tomorrow', after('2026-10-24T12:00:00Z'), 'Europe/Berlin'))).toBe('2026-10-25T08:00:00.000Z')
    })

    test('rolls over the end of a month', () => {
        expect(iso(snoozeUntil('tomorrow', after('2026-12-31T12:00:00Z'), 'UTC'))).toBe('2027-01-01T09:00:00.000Z')
    })
})



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

    test('saved within its own minute still goes off', () => {
        expect(iso(firstOccurrence(rule({ repeat: 'never' }), after('2026-10-20T07:00:12Z')))).toBe('2026-10-20T07:00:00.000Z')
    })

    test('saved after its minute is over', () => {
        expect(firstOccurrence(rule({ repeat: 'never' }), after('2026-10-20T07:01:00Z'))).toBeNull()
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



// LIMITS ====================================================================================================
describe('only and except rules', () => {
    // Every 2 hours from 8:00 UTC on Tuesday October 20 2026
    const every2h = (rules: Parameters<typeof occurrenceAfter>[0]['rules']) => rule({ repeat: 'hours', every: 2, at: '2026-10-20T08:00:00.000Z', timezone: 'UTC', rules })

    test('only a stretch of the day', () => {
        const limited = every2h([{ mode: 'only', kind: 'times', from: '13:00', to: '17:00' }])
        expect(iso(occurrenceAfter(limited, after('2026-10-20T08:30:00Z')))).toBe('2026-10-20T14:00:00.000Z')
        expect(iso(occurrenceAfter(limited, after('2026-10-20T16:30:00Z')))).toBe('2026-10-21T14:00:00.000Z')
    })

    test('except a stretch across midnight', () => {
        const quiet = every2h([{ mode: 'except', kind: 'times', from: '22:00', to: '07:00' }])
        expect(iso(occurrenceAfter(quiet, after('2026-10-20T20:30:00Z')))).toBe('2026-10-21T08:00:00.000Z')
    })

    test('except weekends', () => {
        const weekdaysOnly = rule({ at: '2026-10-23T09:00:00.000Z', timezone: 'UTC', rules: [{ mode: 'except', kind: 'days', days: ['sa', 'su'] }] })
        expect(iso(occurrenceAfter(weekdaysOnly, after('2026-10-23T10:00:00Z')))).toBe('2026-10-26T09:00:00.000Z')
    })

    test('only dates that already passed never go off again', () => {
        const over = rule({ timezone: 'UTC', at: '2026-10-20T09:00:00.000Z', rules: [{ mode: 'only', kind: 'dates', from: '2026-10-01', to: '2026-10-21' }] })
        expect(iso(occurrenceAfter(over, after('2026-10-20T10:00:00Z')))).toBe('2026-10-21T09:00:00.000Z')
        expect(occurrenceAfter(over, after('2026-10-21T10:00:00Z'))).toBeNull()
    })

    test('a once reminder ignores the rules', () => {
        const once = rule({ repeat: 'never', timezone: 'UTC', at: '2026-10-24T09:00:00.000Z', rules: [{ mode: 'except', kind: 'days', days: ['sa'] }] })
        expect(iso(occurrenceAfter(once, after('2026-10-20T00:00:00Z')))).toBe('2026-10-24T09:00:00.000Z')
    })
})
