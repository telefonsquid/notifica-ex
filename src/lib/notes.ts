import { parseTimestamp } from '#lib/reminders.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { NOTE_SOLIDS, NOTE_STICKIES, NOTE_TEXTURES, NOTE_TINTS } from '#lib/note_colors.ts';
import type { Label, Note, NoteColor, NoteContent, Reminder } from '#lib/schemas.ts';

// LIST ======================================================================================================

export type NoteEvent = { action: string, record: Note }

// Patch single notes into the list | an answer older than what the list holds changes nothing
export function mergeNotes(list: Note[], events: NoteEvent[]): Note[] {
    const merged = new Map(list.map((note) => [note.id, note]))

    for(const { action, record } of events){
        const held = merged.get(record.id)
        if(action === 'delete') merged.delete(record.id)
        else if(!held || record.updated >= held.updated) merged.set(record.id, record)
    }

    return [...merged.values()]
}

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

// The priority chart, highest first | ties fall back to the name so every browser agrees
export function autoColorOrder(labels: Label[]): Label[] {
    return labels
        .filter((label) => label.autoColor)
        .toSorted((a, b) => a.colorPriority - b.colorPriority || a.name.localeCompare(b.name))
}

export function lastPriority(labels: Label[]): number {
    return Math.max(-1, ...autoColorOrder(labels).map((label) => label.colorPriority))
}

// What a note wears | its own color wins, without one the highest auto color label on it decides
export function shownColor(note: Pick<NoteContent, 'color' | 'labels'>, order: Label[]): NoteColor {
    if(note.color) return note.color
    return order.find((label) => note.labels.includes(label.id))?.color ?? ''
}



// CONTENT ====================================================================================================
export function emptyNote(): NoteContent {
    return { title: '', body: '', color: '', labels: [], pinned: false, archived: false }
}

// Text from another app | other apps know nothing of the size caps
export function sharedContent(title: string, text: string): Partial<NoteContent> {
    return { title: title.trim().slice(0, LIMITS.NOTE_TITLE), body: text.trim().slice(0, LIMITS.NOTE_BODY) }
}

export function isEmpty(note: NoteContent): boolean {
    return !note.title.trim() && !note.body.trim()
}



// REMINDERS ====================================================================================================
const formats = new Map<string, Intl.DateTimeFormat>()

// Formats in the reminder's own zone, so server and browser render the same text
function inZone(date: Date, timezone: string, style: 'moment' | 'time' | 'key' | 'day' | 'date'): string {
    const id = `${timezone} ${style}`
    let format = formats.get(id)
    if(!format){
        const options: Record<typeof style, Intl.DateTimeFormatOptions> = {
            moment: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
            time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
            key: { year: 'numeric', month: '2-digit', day: '2-digit' },
            day: { weekday: 'short', day: 'numeric', month: 'short' },
            date: { day: 'numeric', month: 'short', year: 'numeric' },
        }
        format = new Intl.DateTimeFormat(style === 'key' ? 'en-CA' : 'en-GB', { timeZone: timezone, ...options[style] })
        formats.set(id, format)
    }
    return format.format(date)
}

export function formatMoment(value: string, timezone: string): string {
    const date = parseTimestamp(value)
    return date ? inZone(date, timezone, 'moment') : ''
}

// Just the clock, as "08:30"
export function formatTime(value: string, timezone: string): string {
    const date = parseTimestamp(value)
    return date ? inZone(date, timezone, 'time') : ''
}

// The calendar day a moment falls on, as a sortable "2026-11-01"
export function dayKey(value: string, timezone: string): string {
    const date = parseTimestamp(value)
    return date ? inZone(date, timezone, 'key') : ''
}

// Today, Yesterday, "Sun 1 Nov", the year only once it isn't this one
export function formatDay(value: string, timezone: string, now: number): string {
    const date = parseTimestamp(value)
    if(!date) return ''

    const key = inZone(date, timezone, 'key')
    const today = inZone(new Date(now), timezone, 'key')
    if(key === today) return 'Today'
    if(key === inZone(new Date(now - 86_400_000), timezone, 'key')) return 'Yesterday'
    return inZone(date, timezone, key.slice(0, 4) === today.slice(0, 4) ? 'day' : 'date')
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

    // Rounding may reach the next unit, 59.6 minutes read as in 1 hour, not in 60 minutes
    let index = Math.max(0, STEPS.findLastIndex(([, size]) => left >= size))
    if(index < STEPS.length - 1 && Math.round(left / STEPS[index][1]) * STEPS[index][1] >= STEPS[index + 1][1]) index++
    const [unit, size] = STEPS[index]
    return relative.format(Math.round(left / size), unit)
}

// A closed card's height before it was ever on screen | a rough guess is enough, the real one replaces it long before it shows
export function estimatedHeight(note: Pick<Note, 'title' | 'body' | 'images'>): number {
    const lines = note.body.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 40)), 0)
    return 48 + (note.title ? 28 : 0) + (note.body ? Math.min(lines, 12) * 22 : 0) + (note.images?.length ? 180 : 0)
}

// A task with times that went off but were not checked off yet
export function isOpenTask(reminder: Reminder): boolean {
    return reminder.task && reminder.open > 0
}
