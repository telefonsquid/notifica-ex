import { parseTimestamp } from '#lib/reminders.ts';
import { NOTE_SOLIDS, NOTE_STICKIES, NOTE_TINTS, type NoteColor, type NoteContent, type Reminder } from '#lib/schemas.ts';

// COLORS ====================================================================================================

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

// A task whose last notification went out but was not checked off yet
export function isOpenTask(reminder: Reminder): boolean {
    return reminder.task && !!reminder.sent && reminder.done !== reminder.sent
}
