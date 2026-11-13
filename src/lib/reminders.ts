import type { Reminder, ReminderLimit, ReminderRepeat, Weekday } from '#lib/schemas/reminders.ts';

type Rule = { at: string, repeat: ReminderRepeat, every: number, weekdays?: Weekday[], until?: string, timezone: string, rules?: ReminderLimit[] }

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MAX_HOPS = 500 // blocked stretches a search skips before it gives up

export const REPEATS = ['never', 'minutes', 'hours', 'days', 'weeks', 'weekdays', 'months', 'years'] as const

// Monday first, as on the picker
export const WEEKDAY_CODES = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAYS = WEEKDAY_CODES.map((value, index) => ({ value, short: WEEKDAY_NAMES[index] }))

// getUTCDay counts from sunday
function weekdayOf({ year, month, day }: { year: number, month: number, day: number }): Weekday {
    return WEEKDAY_CODES[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7]
}

// The day this moment falls on in the browser's own zone
export function localWeekday(date: Date): Weekday {
    return weekdayOf({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}



// TIMESTAMPS ====================================================================================================

// Reads both pocketbase dates and iso strings | empty or broken ones come back as null
// How PocketBase writes a time | filters compare it as text, so an ISO time would sort wrong against stored ones
export function pbTime(date: Date) {
    return date.toISOString().replace('T', ' ')
}

export function parseTimestamp(value: string | undefined | null): Date | null {
    if(!value) return null
    const date = new Date(value.replace(' ', 'T'))
    return isNaN(date.getTime()) ? null : date
}



// DISPATCH ====================================================================================================

// Still waiting to go off at this moment
export function isDue(reminder: { next: string }, now: Date) {
    const next = parseTimestamp(reminder.next)
    return !!next && next <= now
}

// The next time to store once a reminder went off, null leaves the row alone | a run takes minutes, a snooze or edit may have landed meanwhile
export function movedOn(wentOff: { next: string }, latest: (Rule & { next: string }) | null, now: Date): string | null {
    if(!latest || latest.next !== wentOff.next) return null
    return occurrenceAfter(latest, now)?.toISOString() ?? ''
}



// RECURRENCE ====================================================================================================

// Minutes to years take a count and read as "every 3 days"
export function isCounted(repeat: ReminderRepeat) {
    return repeat !== 'never' && repeat !== 'weekdays'
}

// A rule without the parts its repeat leaves out, so what a form still holds neither counts nor gets stored
export function normalizeRule<T extends Rule>(rule: T) {
    const once = rule.repeat === 'never'
    return {
        ...rule,
        every: isCounted(rule.repeat) ? rule.every : 1,
        weekdays: rule.repeat === 'weekdays' ? rule.weekdays ?? [] : [],
        until: once ? '' : rule.until ?? '',
        rules: once ? [] : rule.rules ?? [],
    }
}

// First time the rule goes off after the given moment, null once it is over
export function occurrenceAfter(rule: Rule, after: Date): Date | null {
    const start = parseTimestamp(rule.at)
    if(!start) return null

    const { until: end, rules: limits } = normalizeRule(rule)
    const until = parseTimestamp(end)

    // A blocked time skips the whole blocked stretch, so a few hops reach the next allowed one
    let from = after
    for(let hop = 0; hop < MAX_HOPS; hop++){
        const next = nextOccurrence(rule, start, from)
        if(!next || (until && next > until)) return null

        const resume = blockedUntil(limits, next, rule.timezone)
        if(!resume) return next
        if(resume === 'never') return null
        from = new Date(resume.getTime() - 1)
    }
    return null
}

// PHONE SCHEDULE ====================================================================================================

// A stored next time a little past still counts, the dispatch run may be about to send it
const SCHEDULE_GRACE = 5 * MINUTE

// The times a phone sets alarms for, from the stored next time on | a snooze or edit changes next, so the phone learns of it on its next sync
export function upcomingTimes(reminder: Rule & { next: string }, now: Date, until: Date, max: number): Date[] {
    const times: Date[] = []
    let at = parseTimestamp(reminder.next)
    if(at && at.getTime() < now.getTime() - SCHEDULE_GRACE) at = occurrenceAfter(reminder, now)

    while(at && at <= until && times.length < max){
        times.push(at)
        at = occurrenceAfter(reminder, at)
    }
    return times
}

// When a snoozed reminder goes off again | tomorrow means 9:00 on the clock of the reminder's own zone
// Opens a card with a blank reminder form instead of a stored reminder
export const NEW_REMINDER = 'new'

export const SNOOZE_CHOICES = ['hour', 'tomorrow'] as const
export type SnoozeChoice = typeof SNOOZE_CHOICES[number]

export function snoozeUntil(choice: SnoozeChoice, now: Date, timezone: string): Date {
    if(choice === 'hour') return new Date(now.getTime() + 60 * MINUTE)
    const wall = wallClock(now, timezone)
    return fromWallClock({ ...wall, day: wall.day + 1, hour: 9, minute: 0, second: 0 }, timezone)
}

// That hour on a day like 2026-12-31, on the clock of the zone
export function dayAt(date: string, hour: number, timezone: string): Date {
    const [year, month, day] = date.split('-').map(Number)
    return fromWallClock({ year, month, day, hour, minute: 0, second: 0 }, timezone)
}

// The clock time of one moment, on another day like 2026-12-31
export function sameClockOn(date: string, like: Date, timezone: string): Date {
    const [year, month, day] = date.split('-').map(Number)
    return fromWallClock({ ...wallClock(like, timezone), year, month, day }, timezone)
}

// Hour and minute a clock in that zone shows at this moment
export function clockOf(date: Date, timezone: string) {
    const { hour, minute } = wallClock(date, timezone)
    return { hour, minute }
}

// First time of a rule being saved now | the form picks whole minutes, so the current one still counts
export function firstOccurrence(rule: Rule, now: Date): Date | null {
    return occurrenceAfter(rule, new Date(Math.floor(now.getTime() / MINUTE) * MINUTE - 1))
}

function nextOccurrence(rule: Rule, start: Date, after: Date): Date | null {

    // WEEKDAYS | the start itself only counts when it falls on one of the days
    if(rule.repeat === 'weekdays') return nextWeekday(rule, start, after)
    if(start > after) return start

    // ONE OFF
    if(rule.repeat === 'never') return null

    // MINUTES AND HOURS | plain steps, the clock time may drift across daylight saving
    if(rule.repeat === 'minutes' || rule.repeat === 'hours'){
        const step = rule.every * (rule.repeat === 'minutes' ? MINUTE : HOUR)
        const passed = Math.floor((after.getTime() - start.getTime()) / step) + 1
        return new Date(start.getTime() + passed * step)
    }

    // MONTHS AND YEARS | same day of the month, the 31st falls back to the last day of shorter months
    const wall = wallClock(start, rule.timezone)
    if(rule.repeat === 'months' || rule.repeat === 'years'){
        const months = rule.every * (rule.repeat === 'years' ? 12 : 1)
        const now = wallClock(after, rule.timezone)
        let passed = Math.max(0, Math.floor(((now.year - wall.year) * 12 + now.month - wall.month) / months))

        let next = monthsLater(wall, passed * months, rule.timezone)
        while(next <= after){
            passed++
            next = monthsLater(wall, passed * months, rule.timezone)
        }
        return next
    }

    // DAYS AND WEEKS | same clock time in the reminder's own timezone
    const days = rule.every * (rule.repeat === 'weeks' ? 7 : 1)
    let passed = Math.max(0, Math.floor((after.getTime() - start.getTime()) / (days * DAY)))

    // The estimate is off by one at most when a daylight saving change lies in between
    let next = fromWallClock({ ...wall, day: wall.day + passed * days }, rule.timezone)
    while(next <= after){
        passed++
        next = fromWallClock({ ...wall, day: wall.day + passed * days }, rule.timezone)
    }
    return next
}

// The clock time of the start on the first picked day after the moment, a week holds one for sure
function nextWeekday(rule: Rule, start: Date, after: Date): Date | null {
    if(!rule.weekdays?.length) return null

    const from = start > after ? start : after
    const wall = { ...wallClock(start, rule.timezone), ...dateOf(wallClock(from, rule.timezone)) }

    for(let offset = 0; offset <= 7; offset++){
        const day = { ...wall, day: wall.day + offset }
        if(!rule.weekdays.includes(weekdayOf(day))) continue

        const next = fromWallClock(day, rule.timezone)
        if(next >= start && next > after) return next
    }
    return null
}

function monthsLater(wall: WallClock, months: number, timezone: string): Date {
    const total = wall.month - 1 + months
    const year = wall.year + Math.floor(total / 12)
    const month = total % 12 + 1
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return fromWallClock({ ...wall, year, month, day: Math.min(wall.day, last) }, timezone)
}

function dateOf(wall: WallClock){
    return { year: wall.year, month: wall.month, day: wall.day }
}



// LIMITS ====================================================================================================

// Moment a blocked occurrence may go off again, 'never' when no later one can | null when nothing blocks it
function blockedUntil(limits: ReminderLimit[], moment: Date, timezone: string): Date | 'never' | null {
    if(!limits.length) return null

    const wall = wallClock(moment, timezone)
    const date = isoDate(wall)
    const clock = wall.hour * 60 + wall.minute
    const weekday = weekdayOf(wall)
    const at = (days: number, minutes: number) => fromWallClock({ ...wall, day: wall.day + days, hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0 }, timezone)
    const midnight = (date: string, days = 0) => {
        const day = parseDate(date)
        return fromWallClock({ ...day, day: day.day + days, hour: 0, minute: 0, second: 0 }, timezone)
    }
    const matches = (limit: ReminderLimit) =>
        limit.kind === 'times' ? inWindow(clock, minutesOf(limit.from), minutesOf(limit.to))
        : limit.kind === 'days' ? limit.days.includes(weekday)
        : limit.from <= date && date <= limit.to

    // Every blocking rule frees a stretch that starts now, so the latest end frees them all
    const ends: Date[] = []

    // EXCEPT | any match blocks until the matched stretch ends
    for(const limit of limits){
        if(limit.mode !== 'except' || !matches(limit)) continue
        if(limit.kind === 'days') ends.push(at(1, 0))
        if(limit.kind === 'dates') ends.push(midnight(limit.to, 1))
        if(limit.kind === 'times'){
            const to = minutesOf(limit.to)
            ends.push(at(to > clock ? 0 : 1, to))
        }
    }

    // ONLY | each kind with only rules needs one of them to match
    for(const kind of ['times', 'days', 'dates'] as const){
        const only = limits.filter((limit) => limit.mode === 'only' && limit.kind === kind)
        if(!only.length || only.some(matches)) continue

        if(kind === 'days') ends.push(at(1, 0))
        if(kind === 'dates'){
            const ahead = only.flatMap((limit) => limit.kind === 'dates' && limit.from > date ? [limit.from] : []).sort()[0]
            if(!ahead) return 'never'
            ends.push(midnight(ahead))
        }
        if(kind === 'times'){
            const starts = only.flatMap((limit) => limit.kind === 'times' && limit.from !== limit.to ? [minutesOf(limit.from)] : []).sort((a, b) => a - b)
            if(!starts.length) return 'never'
            const today = starts.find((start) => start > clock)
            ends.push(today === undefined ? at(1, starts[0]) : at(0, today))
        }
    }

    if(!ends.length) return null
    return new Date(Math.max(...ends.map((end) => end.getTime())))
}

// Window may run past midnight | equal ends make an empty window
function inWindow(clock: number, from: number, to: number){
    if(from < to) return from <= clock && clock < to
    if(from > to) return clock >= from || clock < to
    return false
}

function minutesOf(time: string){
    const [hour, minute] = time.split(':').map(Number)
    return hour * 60 + minute
}

function parseDate(date: string){
    const [year, month, day] = date.split('-').map(Number)
    return { year, month, day }
}

function isoDate(wall: WallClock){
    return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
}



// LABELS ====================================================================================================

// Short label for the rule, like "Every 16 hours · 14:00–16:00 · except Sat, Sun"
export function describeRule(rule: Pick<Rule, 'repeat' | 'every' | 'weekdays' | 'rules'>): string {
    if(rule.repeat === 'never') return 'Once'
    return [describeRepeat(rule), ...(rule.rules ?? []).map(describeLimit)].join(' · ')
}

function describeRepeat(rule: Pick<Rule, 'repeat' | 'every' | 'weekdays'>): string {
    if(rule.repeat === 'weekdays') return describeDays(rule.weekdays ?? [], 'Daily')
    if(rule.repeat === 'never') return 'Once'

    if(rule.every === 1) return { minutes: 'Every minute', hours: 'Hourly', days: 'Daily', weeks: 'Weekly', months: 'Monthly', years: 'Yearly' }[rule.repeat]
    return `Every ${rule.every} ${UNITS[rule.repeat]}s`
}

function describeLimit(limit: ReminderLimit): string {
    const range =
        limit.kind === 'times' ? `${limit.from}–${limit.to}`
        : limit.kind === 'days' ? describeDays(limit.days, 'Every day')
        : limit.from === limit.to ? shortDate(limit.from) : `${shortDate(limit.from)}–${shortDate(limit.to)}`
    return limit.mode === 'except' ? `except ${range}` : range
}

function describeDays(picks: Weekday[], all: string): string {
    const days = WEEKDAYS.filter((day) => picks.includes(day.value))
    const weekend = picks.filter((day) => day === 'sa' || day === 'su').length
    if(days.length === 7) return all
    if(days.length === 5 && !weekend) return 'Weekdays'
    if(days.length === 2 && weekend === 2) return 'Weekends'
    return days.map((day) => day.short).join(', ') || 'No days'
}

// Like "1 Jul", the same on server and client
function shortDate(date: string){
    const { year, month, day } = parseDate(date)
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

// Singular unit of each interval, for labels like "every 3 days"
export const UNITS = { minutes: 'minute', hours: 'hour', days: 'day', weeks: 'week', months: 'month', years: 'year' } as const



// TIMEZONES ====================================================================================================
type WallClock = { year: number, month: number, day: number, hour: number, minute: number, second: number }

const formatters = new Map<string, Intl.DateTimeFormat>()

// One formatter per zone, creating them is slow
function formatter(timezone: string){
    let format = formatters.get(timezone)
    if(!format){
        format = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, hourCycle: 'h23',
            year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
        })
        formatters.set(timezone, format)
    }
    return format
}

// Date and time a clock in that zone shows at this moment
function wallClock(date: Date, timezone: string): WallClock {
    const parts = Object.fromEntries(formatter(timezone).formatToParts(date).map((part) => [part.type, Number(part.value)]))
    return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

// Moment a clock in that zone shows the given time | overflowing days roll into the next month
function fromWallClock(wall: WallClock, timezone: string): Date {
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)

    // The zone offset can differ between the guess and the result, so check once more
    let moment = asUtc - offset(asUtc, timezone)
    const corrected = asUtc - offset(moment, timezone)
    if(corrected !== moment) moment = corrected

    return new Date(moment)
}

// How far that zone's clock runs ahead of utc at this moment
function offset(moment: number, timezone: string): number {
    const wall = wallClock(new Date(moment), timezone)
    const shown = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
    return shown - Math.floor(moment / 1000) * 1000
}



// DELIVERY ====================================================================================================

// What the test buttons in the settings can reach
export const TEST_CHANNELS = ['phone', 'browser', 'ntfy'] as const
export type TestChannel = typeof TEST_CHANNELS[number]



// ON A NOTE ====================================================================================================
// A task with times that went off but were not checked off yet
export function isOpenTask(reminder: Reminder): boolean {
    return reminder.task && reminder.open > 0
}

// Soonest first, finished ones last
export function groupReminders(reminders: Reminder[]): Map<string, Reminder[]> {
    const grouped = new Map<string, Reminder[]>()
    for(const reminder of reminders.toSorted((a, b) => Number(!a.next) - Number(!b.next) || a.next.localeCompare(b.next))){
        const group = grouped.get(reminder.note)
        if(group) group.push(reminder)
        else grouped.set(reminder.note, [reminder])
    }
    return grouped
}
