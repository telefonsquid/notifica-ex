import type { ReminderRepeat, Weekday } from '#lib/schemas.ts';

type Rule = { at: string, repeat: ReminderRepeat, every: number, weekdays?: Weekday[], until?: string, timezone: string }

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Monday first, as on the picker | getUTCDay counts from sunday
export const WEEKDAYS: { value: Weekday, short: string }[] = [
    { value: 'mo', short: 'Mon' }, { value: 'tu', short: 'Tue' }, { value: 'we', short: 'Wed' }, { value: 'th', short: 'Thu' },
    { value: 'fr', short: 'Fri' }, { value: 'sa', short: 'Sat' }, { value: 'su', short: 'Sun' },
]
const BY_DAY_INDEX: Weekday[] = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa']



// TIMESTAMPS ====================================================================================================

// Reads both pocketbase dates and iso strings | empty or broken ones come back as null
export function parseTimestamp(value: string | undefined | null): Date | null {
    if(!value) return null
    const date = new Date(value.replace(' ', 'T'))
    return isNaN(date.getTime()) ? null : date
}



// RECURRENCE ====================================================================================================

// First time the rule goes off after the given moment, null once it is over
export function occurrenceAfter(rule: Rule, after: Date): Date | null {
    const start = parseTimestamp(rule.at)
    if(!start) return null

    const next = nextOccurrence(rule, start, after)
    const until = rule.repeat === 'never' ? null : parseTimestamp(rule.until)
    return next && until && next > until ? null : next
}

function nextOccurrence(rule: Rule, start: Date, after: Date): Date | null {

    // WEEKDAYS | the start itself only counts when it falls on one of the days
    if(rule.repeat === 'weekdays') return nextWeekday(rule, start, after)
    if(start > after) return start

    // ONE OFF
    if(rule.repeat === 'never') return null

    // HOURS | plain steps, the clock time may drift across daylight saving
    if(rule.repeat === 'hours'){
        const step = rule.every * HOUR
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
        const weekday = BY_DAY_INDEX[new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()]
        if(!rule.weekdays.includes(weekday)) continue

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

// Short label for the rule, like "Every 16 hours" or "Mon, Wed, Fri"
export function describeRule(rule: Pick<Rule, 'repeat' | 'every' | 'weekdays'>): string {
    if(rule.repeat === 'never') return 'Once'

    if(rule.repeat === 'weekdays'){
        const days = WEEKDAYS.filter((day) => rule.weekdays?.includes(day.value))
        if(days.length === 7) return 'Daily'
        if(days.length === 5 && !rule.weekdays?.some((day) => day === 'sa' || day === 'su')) return 'Weekdays'
        return days.map((day) => day.short).join(', ') || 'No days'
    }

    if(rule.every === 1) return { hours: 'Hourly', days: 'Daily', weeks: 'Weekly', months: 'Monthly', years: 'Yearly' }[rule.repeat]
    return `Every ${rule.every} ${UNITS[rule.repeat]}s`
}

// Singular unit of each interval, for labels like "every 3 days"
export const UNITS = { hours: 'hour', days: 'day', weeks: 'week', months: 'month', years: 'year' } as const



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
