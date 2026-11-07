import { tasksOf } from '#lib/markdown.ts';
import { isOpenTask, shownColor } from '#lib/notes.ts';
import { parseTimestamp } from '#lib/reminders.ts';
import type { DateRange, Label, Note, NoteContent, Reminder, ViewContent, ViewFilter, ViewSort } from '#lib/schemas.ts';

/*
    A view is a saved set of filters plus a sort order.
    Matching runs in the browser and on the server alike, so both render the same notes.
*/



// DEFAULTS ====================================================================================================
const anyDate = (): DateRange => ({ mode: 'any', amount: 7, unit: 'days', from: '', to: '' })

// Same as what viewFilterSchema and viewSortSchema fill in, a test holds them together | written out so the browser can do without zod
export const emptyFilter = (): ViewFilter => ({
    words: '',
    without: '',
    titleOnly: false,
    include: [],
    exclude: [],
    labelMatch: 'any',
    labelled: 'any',
    colors: [],
    pinned: 'any',
    archived: 'hide',
    reminder: 'any',
    list: 'any',
    created: anyDate(),
    updated: anyDate(),
    due: anyDate()
})

export const defaultSort = (): ViewSort => ({ by: 'manual', direction: 'desc', pinnedFirst: true })

// Every new account starts with these, each can be changed or deleted like any other view
export function starterViews(): ViewContent[] {
    return [
        { name: 'Notes', icon: 'sticky-note', filter: emptyFilter(), sort: defaultSort() },
        { name: 'Reminders', icon: 'bell', filter: { ...emptyFilter(), reminder: 'with' }, sort: { by: 'reminder', direction: 'asc', pinnedFirst: false } },
        { name: 'Archived', icon: 'archive', filter: { ...emptyFilter(), archived: 'only' }, sort: { by: 'updated', direction: 'desc', pinnedFirst: false } }
    ]
}

// How many fields differ from an empty filter
export function countActive(filter: ViewFilter): number {
    const empty = emptyFilter()
    return (Object.keys(empty) as (keyof ViewFilter)[])
        .filter((key) => JSON.stringify(filter[key]) !== JSON.stringify(empty[key]))
        .length
}

export function sameFilter(a: ViewFilter, b: ViewFilter): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}



// NEW NOTES ====================================================================================================

// What a note must carry to show up in the view at all | rules with a choice, like any of two labels, set nothing
export function noteDefaults(filter: ViewFilter): Pick<NoteContent, 'color' | 'labels' | 'pinned' | 'archived'> {
    const labels = filter.labelMatch === 'all' || filter.include.length === 1 ? filter.include : []
    return {
        color: filter.colors.length === 1 ? filter.colors[0] : '',
        labels: labels.filter((id) => !filter.exclude.includes(id)),
        pinned: filter.pinned === 'only',
        archived: filter.archived === 'only',
    }
}



// MATCHING ====================================================================================================
type MatchContext = {
    reminders: Map<string, Reminder[]>  // keyed by note id
    now: Date
    autoColors: Label[]                 // the auto color chart, highest first
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

export function matchesView(note: Note, filter: ViewFilter, context: MatchContext): boolean {
    const reminders = context.reminders.get(note.id) ?? []

    // STATE
    if(filter.archived === 'hide' && note.archived) return false
    if(filter.archived === 'only' && !note.archived) return false
    if(filter.pinned === 'only' && !note.pinned) return false
    if(filter.pinned === 'hide' && note.pinned) return false
    if(filter.colors.length && !filter.colors.includes(shownColor(note, context.autoColors))) return false

    // LABELS
    if(filter.labelled === 'with' && !note.labels.length) return false
    if(filter.labelled === 'without' && note.labels.length) return false
    if(filter.exclude.some((id) => note.labels.includes(id))) return false
    if(filter.include.length){
        const carried = filter.include.filter((id) => note.labels.includes(id)).length
        if(filter.labelMatch === 'all' ? carried < filter.include.length : carried === 0) return false
    }

    // CHECKLIST | notes without one drop out
    if(filter.list !== 'any'){
        const tasks = tasksOf(note.body)
        if(!tasks.length) return false
        const complete = tasks.every(Boolean)
        if(filter.list === 'open' ? complete : !complete) return false
    }

    // REMINDER
    if(!matchesReminders(reminders, filter.reminder)) return false

    // DATES
    if(!inRange(note.created, filter.created, context.now, 'past')) return false
    if(!inRange(note.updated, filter.updated, context.now, 'past')) return false
    if(filter.due.mode !== 'any' && !reminders.some((reminder) => inRange(reminder.next, filter.due, context.now, 'future'))) return false

    // WORDS
    if(!filter.words && !filter.without) return true
    const text = noteText(note, filter.titleOnly)
    return wordsOf(filter.words).every((word) => text.includes(word)) && !wordsOf(filter.without).some((word) => text.includes(word))
}

// Lowercased, ready to look for words in
export function noteText(note: Note, titleOnly = false): string {
    if(titleOnly) return note.title.toLowerCase()
    return `${note.title} ${note.body}`.toLowerCase()
}

export function wordsOf(value: string): string[] {
    return value.toLowerCase().split(/\s+/).filter(Boolean)
}

// Finished needs every reminder of the note through, the rest just one match
function matchesReminders(reminders: Reminder[], state: ViewFilter['reminder']): boolean {
    switch(state){
        case 'any': return true
        case 'with': return reminders.length > 0
        case 'without': return reminders.length === 0
        case 'upcoming': return reminders.some((reminder) => reminder.next)
        case 'repeating': return reminders.some((reminder) => reminder.repeat !== 'never')
        case 'tasks': return reminders.some((reminder) => reminder.task)
        case 'waiting': return reminders.some(isOpenTask)
        case 'finished': return reminders.length > 0 && reminders.every((reminder) => !reminder.next)
    }
}

// Past looks back from now, future looks ahead | a missing date never matches an active range
function inRange(timestamp: string, range: DateRange, now: Date, direction: 'past' | 'future'): boolean {
    if(range.mode === 'any') return true
    const date = parseTimestamp(timestamp)
    if(!date) return false

    if(range.mode === 'between'){
        if(range.from && date < new Date(`${range.from}T00:00`)) return false
        if(range.to && date > new Date(`${range.to}T23:59:59.999`)) return false
        return true
    }

    const edge = shift(now, direction === 'past' ? -range.amount : range.amount, range.unit)
    const near = direction === 'past' ? date >= edge : date <= edge
    return range.mode === 'within' ? near : !near
}

function shift(date: Date, amount: number, unit: DateRange['unit']): Date {
    const shifted = new Date(date)
    if(unit === 'months') shifted.setMonth(shifted.getMonth() + amount)
    else shifted.setDate(shifted.getDate() + amount * (unit === 'weeks' ? 7 : 1))
    return shifted
}



// SORTING ====================================================================================================
export function sortNotes(notes: Note[], sort: ViewSort, reminders: Map<string, Reminder[]>): Note[] {
    const sign = sort.direction === 'asc' ? 1 : -1
    const positions = new Map(sort.by === 'manual' ? notes.map((note) => [note.id, positionOf(note)]) : [])

    // Notes without a reminder always go last, whichever way the rest runs
    const compare = (a: Note, b: Note): number => {
        if(sort.by === 'title') return sign * (a.title || '￿').localeCompare(b.title || '￿')
        if(sort.by === 'reminder'){
            const nextA = reminders.get(a.id)?.[0]?.next, nextB = reminders.get(b.id)?.[0]?.next
            if(!nextA || !nextB) return Number(!nextA) - Number(!nextB)
            return sign * nextA.localeCompare(nextB)
        }
        if(sort.by === 'manual') return sign * (positions.get(a.id)! - positions.get(b.id)!)
        return sign * a[sort.by].localeCompare(b[sort.by])
    }

    return notes.toSorted((a, b) => (sort.pinnedFirst ? Number(b.pinned) - Number(a.pinned) : 0) || compare(a, b))
}

// Creation time stands in until a drag gives the note a place of its own
export function positionOf(note: Note): number {
    return note.position || parseTimestamp(note.created)?.getTime() || 0
}

// A dropped note lands halfway between its new neighbours | either side may be missing at the ends
export function positionBetween(before: Note | undefined, after: Note | undefined, direction: ViewSort['direction']): number {
    const [higher, lower] = direction === 'desc' ? [before, after] : [after, before]
    if(higher && lower) return (positionOf(higher) + positionOf(lower)) / 2
    if(higher) return positionOf(higher) / 2
    if(lower) return positionOf(lower) + 60_000
    return Date.now()
}
