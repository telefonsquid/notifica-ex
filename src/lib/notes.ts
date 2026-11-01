import { parseTimestamp } from '#lib/reminders.ts';
import { NOTE_SOLIDS, NOTE_STICKIES, NOTE_TEXTURES, NOTE_TINTS, type NoteColor, type NoteContent, type Reminder } from '#lib/schemas.ts';

// COLORS ====================================================================================================

// Order of the palette wherever a color gets picked
export const COLOR_GROUPS: { name: string, colors: readonly NoteColor[] }[] = [
    { name: 'Soft', colors: ['', ...NOTE_TINTS] },
    { name: 'Sticky', colors: NOTE_STICKIES },
    { name: 'Solid', colors: NOTE_SOLIDS },
    { name: 'Texture', colors: NOTE_TEXTURES },
]

// New labels pick one so they never all look alike
export function randomLabelColor(): NoteColor {
    const choices = [...NOTE_TINTS, ...NOTE_SOLIDS, ...NOTE_STICKIES]
    return choices[Math.floor(Math.random() * choices.length)]
}

// Turns 'cobalt-solid' into 'Cobalt solid'
export function colorName(color: NoteColor): string {
    if(!color) return 'Plain'
    const words = color.replace('-', ' ')
    return words[0].toUpperCase() + words.slice(1)
}



// CONTENT ====================================================================================================
export function emptyNote(): NoteContent {
    return { title: '', body: '', color: '', labels: [], pinned: false, archived: false }
}

export function isEmpty(note: NoteContent): boolean {
    return !note.title.trim() && !note.body.trim()
}



// REMINDERS ====================================================================================================
const formats = new Map<string, Intl.DateTimeFormat>()

// Formats in the reminder's own zone, so server and browser render the same text
export function formatMoment(value: string, timezone: string): string {
    const date = parseTimestamp(value)
    if(!date) return ''

    let format = formats.get(timezone)
    if(!format){
        format = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        formats.set(timezone, format)
    }
    return format.format(date)
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
    ['week', 604_800_000],
    ['month', 2_629_800_000],
    ['year', 31_557_600_000],
]

// Time left as "in 3 hours" or "in 1 week", in the largest unit that fits at least once
export function formatDistance(value: string, now: number): string {
    const date = parseTimestamp(value)
    if(!date) return ''

    // A one off that already went out has nothing coming
    const left = date.getTime() - now
    if(left < -60_000) return ''
    if(left < 60_000) return 'now'

    const [unit, size] = STEPS.findLast(([, size]) => left >= size) ?? STEPS[0]
    return relative.format(Math.round(left / size), unit)
}

// A task whose last notification went out but was not checked off yet
export function isOpenTask(reminder: Reminder): boolean {
    return reminder.task && !!reminder.sent && reminder.done !== reminder.sent
}
