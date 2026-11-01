import { tasksOf } from '#lib/markdown.ts';
import { isOpenTask } from '#lib/notes.ts';
import { parseTimestamp } from '#lib/reminders.ts';
import { viewFilterSchema, viewSortSchema, type DateRange, type Note, type Reminder, type ViewContent, type ViewFilter, type ViewSort } from '#lib/schemas.ts';

/*
    A view is a saved set of filters plus a sort order.
    Matching runs in the browser and on the server alike, so both render the same notes.
*/



// DEFAULTS ====================================================================================================
export const emptyFilter = (): ViewFilter => viewFilterSchema.parse({})
export const defaultSort = (): ViewSort => viewSortSchema.parse({})

// Every new account starts with these two, both can be changed or deleted like any other view
export function starterViews(): ViewContent[] {
    return [
        { name: 'Notes', icon: 'sticky-note', filter: emptyFilter(), sort: defaultSort() },
        { name: 'Reminders', icon: 'bell', filter: { ...emptyFilter(), reminder: 'with' }, sort: { by: 'reminder', direction: 'asc', pinnedFirst: false } }
    ]
}

// Saved filters may predate newer fields, parsing fills them in
export function readFilter(value: unknown): ViewFilter {
    const parsed = viewFilterSchema.safeParse(value ?? {})
    return parsed.success ? parsed.data : emptyFilter()
}

export function readSort(value: unknown): ViewSort {
    const parsed = viewSortSchema.safeParse(value ?? {})
    return parsed.success ? parsed.data : defaultSort()
}

// How many fields differ from an empty filter | drives the dot on the filter button
export function countActive(filter: ViewFilter): number {
    const empty = emptyFilter()
    return (Object.keys(empty) as (keyof ViewFilter)[])
        .filter((key) => JSON.stringify(filter[key]) !== JSON.stringify(empty[key]))
        .length
}

export function sameFilter(a: ViewFilter, b: ViewFilter): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}



// MATCHING ====================================================================================================
export type MatchContext = {
    reminders: Map<string, Reminder[]>  // keyed by note id
    now: Date
}

// Soonest first, finished ones last
export function groupReminders(reminders: Reminder[]): Map<string, Reminder[]> {
    const grouped = new Map<string, Reminder[]>()
    for(const reminder of reminders.toSorted((a, b) => Number(!a.next) - Number(!b.next) || a.next.localeCompare(b.next))){
        grouped.set(reminder.note, [...(grouped.get(reminder.note) ?? []), reminder])
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
    if(filter.colors.length && !filter.colors.includes(note.color)) return false

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
    if(!inRange(parseTimestamp(note.created), filter.created, context.now, 'past')) return false
    if(!inRange(parseTimestamp(note.updated), filter.updated, context.now, 'past')) return false
    if(filter.due.mode !== 'any' && !reminders.some((reminder) => inRange(parseTimestamp(reminder.next), filter.due, context.now, 'future'))) return false

    // WORDS
    const text = noteText(note, filter.titleOnly)
    if(!wordsOf(filter.words).every((word) => text.includes(word))) return false
    if(wordsOf(filter.without).some((word) => text.includes(word))) return false

    return true
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
function inRange(date: Date | null, range: DateRange, now: Date, direction: 'past' | 'future'): boolean {
    if(range.mode === 'any') return true
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

    // Notes without a reminder always go last, whichever way the rest runs
    const compare = (a: Note, b: Note): number => {
        if(sort.by === 'title') return sign * (a.title || '￿').localeCompare(b.title || '￿')
        if(sort.by === 'reminder'){
            const nextA = reminders.get(a.id)?.[0]?.next, nextB = reminders.get(b.id)?.[0]?.next
            if(!nextA || !nextB) return Number(!nextA) - Number(!nextB)
            return sign * nextA.localeCompare(nextB)
        }
        if(sort.by === 'manual') return sign * (positionOf(a) - positionOf(b))
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
