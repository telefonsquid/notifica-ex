import { parseTimestamp } from '#lib/reminders.ts';
import type { NoteColor, NoteContent, NoteItem, NoteKind, Reminder } from '#lib/schemas.ts';

// COLORS ====================================================================================================

// Written out in full, Tailwind only finds class names it can read in the source
export const NOTE_BACKGROUNDS: Record<NoteColor, string> = {
    '': 'bg-card',
    tangerine: 'bg-note-tangerine',
    powder: 'bg-note-powder',
    platinum: 'bg-note-platinum',
    moss: 'bg-note-moss',
    rose: 'bg-note-rose',
    violet: 'bg-note-violet',
}



// CONTENT ====================================================================================================
export function emptyNote(kind: NoteKind): NoteContent {
    return { title: '', kind, body: '', items: kind === 'list' ? [newItem()] : [], color: '', labels: [], pinned: false, archived: false }
}

export function newItem(text = ''): NoteItem {
    return { id: crypto.randomUUID(), text, done: false }
}

export function isEmpty(note: NoteContent): boolean {
    return !note.title.trim() && !note.body.trim() && !note.items.some((item) => item.text.trim())
}

// SWITCH KIND | text turns into one item per line and back, so nothing typed gets lost
export function convertKind(note: NoteContent, kind: NoteKind): NoteContent {
    if(kind === 'list' && note.kind !== 'list'){
        const lines = note.body.split('\n').map((line) => line.trim()).filter(Boolean)
        return { ...note, kind, body: '', items: lines.length ? lines.map((line) => newItem(line)) : [newItem()] }
    }
    if(kind !== 'list' && note.kind === 'list'){
        const body = note.items.map((item) => item.text).filter((text) => text.trim()).join('\n')
        return { ...note, kind, body, items: [] }
    }
    return { ...note, kind }
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
