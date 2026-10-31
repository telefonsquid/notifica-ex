import type { ReminderRepeat } from '#lib/schemas.ts';

type Rule = { at: string, repeat: ReminderRepeat, every: number, timezone: string }

const HOUR = 60 * 60 * 1000



// TIMESTAMPS ====================================================================================================

// Reads both pocketbase dates and iso strings | empty or broken ones come back as null
export function parseTimestamp(value: string | undefined | null): Date | null {
    if(!value) return null
    const date = new Date(value.replace(' ', 'T'))
    return isNaN(date.getTime()) ? null : date
}



// RECURRENCE ====================================================================================================

// First time the rule goes off after the given moment, null once a one off reminder is past
export function occurrenceAfter(rule: Rule, after: Date): Date | null {
    const start = parseTimestamp(rule.at)
    if(!start) return null
    if(start > after) return start

    // ONE OFF
    if(rule.repeat === 'never') return null

    // HOURS | plain steps, the clock time may drift across daylight saving
    if(rule.repeat === 'hours'){
        const step = rule.every * HOUR
        const passed = Math.floor((after.getTime() - start.getTime()) / step) + 1
        return new Date(start.getTime() + passed * step)
    }

    // DAYS AND WEEKS | same clock time in the reminder's own timezone
    const days = rule.every * (rule.repeat === 'weeks' ? 7 : 1)
    const wall = wallClock(start, rule.timezone)
    let passed = Math.max(0, Math.floor((after.getTime() - start.getTime()) / (days * 24 * HOUR)))

    // The estimate is off by one at most when a daylight saving change lies in between
    let next = fromWallClock({ ...wall, day: wall.day + passed * days }, rule.timezone)
    while(next <= after){
        passed++
        next = fromWallClock({ ...wall, day: wall.day + passed * days }, rule.timezone)
    }
    return next
}

// Short label for the rule, like "Every 16 hours"
export function describeRule(rule: Pick<Rule, 'repeat' | 'every'>): string {
    if(rule.repeat === 'never') return 'Once'

    const unit = { hours: 'hour', days: 'day', weeks: 'week' }[rule.repeat]
    if(rule.every === 1) return { hours: 'Hourly', days: 'Daily', weeks: 'Weekly' }[rule.repeat]
    return `Every ${rule.every} ${unit}s`
}



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
