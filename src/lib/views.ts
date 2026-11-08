import { tasksOf } from '#lib/markdown.ts';
import { shownColor } from '#lib/auto_colors.ts';
import { positionOf } from '#lib/note_position.ts';
import { isOpenTask, parseTimestamp } from '#lib/reminders.ts';
import type { Label, Note, NoteContent } from '#lib/schemas/notes.ts';
import type { Reminder } from '#lib/schemas/reminders.ts';
import type { DateRange, ViewContent, ViewFilter, ViewSort } from '#lib/schemas/views.ts';

/*
    A view is a saved set of filters plus a sort order, matched in the browser.
*/



// DEFAULTS ====================================================================================================
const anyDate = (): DateRange => ({ mode: 'any', amount: 7, unit: 'days', from: '', to: '' })

// Same as what viewFilterSchema and viewSortSchema fill in, a test holds them together | written out so the browser can do without zod
export const emptyFilter = (): ViewFilter => ({
    words: '',
    without: '',
    titleOnly: false,
    matchCase: false,
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

// The first view lives at the root, the rest at their own address
export function viewParams(view: { id: string }, index: number) {
    return { view: index === 0 ? undefined : view.id }
}

export function sameFilter(a: ViewFilter, b: ViewFilter): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}



// FILTER FIELDS ====================================================================================================
export type FilterSection = 'words' | 'labels' | 'state' | 'reminder' | 'colors' | 'dates'
type FilterField = keyof ViewFilter

// The simple editor's on and off filters, each with the value it turns on
const SIMPLE_TOGGLES = { pinned: 'only', reminder: 'with', list: 'open' } as const
type SimpleToggle = keyof typeof SIMPLE_TOGGLES

export const isToggled = (filter: ViewFilter, field: SimpleToggle) => filter[field] === SIMPLE_TOGGLES[field]

export function flipToggle(filter: ViewFilter, field: SimpleToggle): Partial<ViewFilter> {
    return { [field]: isToggled(filter, field) ? emptyFilter()[field] : SIMPLE_TOGGLES[field] }
}

// The advanced editor's section of each field | simple says when the simple editor can show the value too
const FILTER_FIELDS: Record<FilterField, { section: FilterSection, simple?: (filter: ViewFilter) => boolean }> = {
    words: { section: 'words', simple: () => true },
    without: { section: 'words' },
    titleOnly: { section: 'words' },
    matchCase: { section: 'words' },
    include: { section: 'labels', simple: () => true },
    exclude: { section: 'labels' },
    labelMatch: { section: 'labels', simple: (filter) => filter.include.length <= 1 },
    labelled: { section: 'labels' },
    colors: { section: 'colors' },
    pinned: { section: 'state', simple: (filter) => isToggled(filter, 'pinned') },
    archived: { section: 'state', simple: () => true },
    list: { section: 'state', simple: (filter) => isToggled(filter, 'list') },
    reminder: { section: 'reminder', simple: (filter) => isToggled(filter, 'reminder') },
    created: { section: 'dates' },
    updated: { section: 'dates' },
    due: { section: 'dates' },
}

function activeFields(filter: ViewFilter): FilterField[] {
    const empty = emptyFilter()
    return (Object.keys(FILTER_FIELDS) as FilterField[]).filter((field) => JSON.stringify(filter[field]) !== JSON.stringify(empty[field]))
}

// How many fields differ from an empty filter
export function countActive(filter: ViewFilter): number {
    return activeFields(filter).length
}

// How many active fields only the advanced editor shows
export function countAdvancedOnly(filter: ViewFilter): number {
    return activeFields(filter).filter((field) => !FILTER_FIELDS[field].simple?.(filter)).length
}

export function isSectionActive(filter: ViewFilter, section: FilterSection): boolean {
    return activeFields(filter).some((field) => FILTER_FIELDS[field].section === section)
}

export function clearSection(filter: ViewFilter, section: FilterSection): ViewFilter {
    const empty = emptyFilter()
    const cleared = (Object.keys(FILTER_FIELDS) as FilterField[]).filter((field) => FILTER_FIELDS[field].section === section)
    return { ...filter, ...Object.fromEntries(cleared.map((field) => [field, empty[field]])) }
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
    const text = noteText(note, filter.titleOnly, filter.matchCase)
    return wordsOf(filter.words, filter.matchCase).every((word) => text.includes(word)) && !wordsOf(filter.without, filter.matchCase).some((word) => text.includes(word))
}

// Lowercased unless the case has to match, ready to look for words in
export function noteText(note: Note, titleOnly = false, matchCase = false): string {
    const text = titleOnly ? note.title : `${note.title} ${note.body}`
    return matchCase ? text : text.toLowerCase()
}

export function wordsOf(value: string, matchCase = false): string[] {
    return (matchCase ? value : value.toLowerCase()).split(/\s+/).filter(Boolean)
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
