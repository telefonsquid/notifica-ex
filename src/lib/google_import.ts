import { clockOf, dayAt, occurrenceAfter, sameClockOn } from '#lib/reminders.ts';
import { IMAGE_TYPES, LIMITS } from '#lib/schema_limits.ts';
import type { ImportedNote } from '#lib/schemas/imports.ts';
import type { NoteColor } from '#lib/schemas/notes.ts';
import type { ReminderRule, Weekday } from '#lib/schemas/reminders.ts';
import { readZip, type ZipEntry } from '#lib/zip.ts';

/*
    Reads a Google Takeout export: Keep notes, one JSON file each with their files beside them,
    and Tasks, where every list becomes a checklist note. The folders carry localised names,
    so the files are told apart by what is inside them.
*/

export type ImportFile = { name: string, field: 'images' | 'attachments', read: () => Promise<File> }

export type Takeout = {
    notes: ImportedNote[]
    files: Map<string, ImportFile[]>               // By source
    problems: { title: string, reason: string }[]   // Left out whole or in part
}

type KeepFile = { path: string, type: string }

// Tasks with only a day remind at this hour
const DUE_HOUR = 7

// Repeating tasks that end after more rounds than this go off once
const LARGEST_ROUNDS = 1000

// Takeout writes one JSON per note, a few MB is more than any note needs
const LARGEST_JSON = 20 * 1024 * 1024

const KEEP_COLORS: Record<string, NoteColor> = {
    RED: 'coral',
    ORANGE: 'tangerine',
    YELLOW: 'lemon',
    GREEN: 'mint',
    TEAL: 'teal',
    BLUE: 'sky',
    CERULEAN: 'cobalt',
    PURPLE: 'violet',
    PINK: 'rose',
    BROWN: 'ochre',
    GRAY: 'slate'
}

// READING ====================================================================================================
export async function readTakeout(picked: File[], timezone: string): Promise<Takeout> {
    const entries: ZipEntry[] = []
    for(const file of picked){
        if(file.name.toLowerCase().endsWith('.zip')) entries.push(...await readZip(file))
        else entries.push({ path: file.name, size: file.size, read: async () => file })
    }

    const found = new FileIndex(entries)
    const takeout: Takeout = { notes: [], files: new Map(), problems: [] }
    for(const entry of entries){
        if(!entry.path.toLowerCase().endsWith('.json') || entry.size > LARGEST_JSON) continue

        let raw: unknown
        try { raw = JSON.parse(await (await entry.read()).text()) }
        catch { continue }

        // KEEP
        const name = entry.path.split('/').pop() ?? entry.path
        const keep = keepNote(raw, `keep:${name}`)
        if(keep){
            const files = keep.files.flatMap((file) => found.beside(entry.path, file) ?? [])
            const missing = keep.files.length - files.length
            if(missing) takeout.problems.push({ title: keep.note.title || name, reason: `${missing} file${missing > 1 ? 's' : ''} missing from the export` })
            add(takeout, keep.note, files)
        }

        // TASKS
        for(const note of taskNotes(raw, timezone)) add(takeout, note, [])
    }
    return takeout
}

function add(takeout: Takeout, note: ImportedNote, files: ImportFile[]) {
    const problem = tooLong(note)
    if(problem){
        takeout.problems.push({ title: note.title || 'Untitled note', reason: problem })
        return
    }

    const reminders = note.reminders ?? []
    if(reminders.length > LIMITS.IMPORT_REMINDERS){
        const left = reminders.length - LIMITS.IMPORT_REMINDERS
        takeout.problems.push({ title: note.title || 'Untitled note', reason: `${left} due date${left > 1 ? 's' : ''} without a reminder, a note takes ${LIMITS.IMPORT_REMINDERS}` })
        note = { ...note, reminders: reminders.slice(0, LIMITS.IMPORT_REMINDERS) }
    }

    takeout.notes.push(note)
    if(files.length) takeout.files.set(note.source, files)
}

// Takeout sometimes names a file .jpeg in the JSON and .jpg in the folder
class FileIndex {
    #byPath = new Map<string, ZipEntry>()
    #byStem = new Map<string, ZipEntry>()

    constructor(entries: ZipEntry[]) {
        for(const entry of entries){
            this.#byPath.set(entry.path, entry)
            this.#byStem.set(stem(entry.path), entry)
        }
    }

    beside(json: string, file: KeepFile): ImportFile | null {
        const path = json.slice(0, json.lastIndexOf('/') + 1) + file.path
        const entry = this.#byPath.get(path) ?? this.#byStem.get(stem(path))
        if(!entry) return null

        const name = entry.path.split('/').pop() ?? file.path
        return {
            name,
            field: IMAGE_TYPES.includes(file.type) ? 'images' : 'attachments',
            read: async () => new File([await entry.read()], name, { type: file.type })
        }
    }
}

function stem(path: string) {
    return path.replace(/\.[^./]*$/, '')
}



// KEEP =======================================================================================================

// Null for anything that isn't a Keep note, or one in the trash
export function keepNote(raw: unknown, source: string): { note: ImportedNote, files: KeepFile[] } | null {
    if(!isRecord(raw) || typeof raw.isTrashed !== 'boolean') return null
    if(!('textContent' in raw) && !('listContent' in raw)) return null
    if(raw.isTrashed) return null

    const lines = list(raw.listContent).flatMap((item) => isRecord(item) ? [`- [${item.isChecked ? 'x' : ' '}] ${oneLine(text(item.text))}`] : [])
    const body = lines.length ? lines.join('\n') : text(raw.textContent).trimEnd()

    // Link previews of Keep, kept as plain links unless the text has them already
    const links = list(raw.annotations).flatMap((link) => isRecord(link) && text(link.url) && !body.includes(text(link.url)) ? [text(link.url)] : [])
    const files = list(raw.attachments).flatMap((file) => isRecord(file) && text(file.filePath) ? [{ path: text(file.filePath), type: text(file.mimetype) }] : [])

    const archived = raw.isArchived === true
    const note = withTitle(text(raw.title).trim(), [body, ...links].filter(Boolean).join('\n\n'), {
        source,
        color: KEEP_COLORS[text(raw.color)] ?? '',
        labels: labelNames(list(raw.labels).map((label) => isRecord(label) ? text(label.name) : '')),
        pinned: raw.isPinned === true && !archived,
        archived,
        position: microseconds(raw.userEditedTimestampUsec) ?? microseconds(raw.createdTimestampUsec) ?? Date.now()
    })

    if(!note.title && !note.body.trim() && !files.length) return null
    return { note, files }
}



// TASKS ======================================================================================================

type Task = { id: string, title: string, notes: string, done: boolean, due: Due | null, parent: string, position: string }
type Due = { at: Date, timezone: string, allDay: boolean, recurrence: string }
type Repeat = Pick<ReminderRule, 'repeat' | 'every' | 'weekdays' | 'until'>

const WEEKDAYS: Record<string, Weekday> = { MONDAY: 'mo', TUESDAY: 'tu', WEDNESDAY: 'we', THURSDAY: 'th', FRIDAY: 'fr', SATURDAY: 'sa', SUNDAY: 'su' }

// Every list with something left in it becomes one checklist note, open tasks above done ones
export function taskNotes(raw: unknown, timezone: string): ImportedNote[] {
    if(!isRecord(raw) || raw.kind !== 'tasks#taskLists') return []

    return list(raw.items).flatMap((taskList) => {
        if(!isRecord(taskList)) return []

        const recurrences = new Map(list(taskList.recurrences).flatMap((item) => isRecord(item) && text(item.id) && isRecord(item.schedule) ? [[text(item.id), item.schedule] as const] : []))
        const tasks = list(taskList.items).flatMap((item): Task[] => {
            if(!isRecord(item) || item.deleted === true || item.hidden === true) return []

            // Done rounds of a repeating task, Google hides them too
            const done = item.status === 'completed'
            if(done && item.visibility === 'PAST_HIDDEN') return []

            const title = oneLine(text(item.title)).trim()
            if(!title) return []
            const recurrence = text(item.task_recurrence_id)
            return [{
                id: text(item.id),
                title,
                notes: text(item.notes).trim(),
                done,
                due: dueOf(item, zoneOf(recurrences.get(recurrence)) ?? timezone, recurrence),
                parent: text(item.parent),
                position: text(item.position)
            }]
        })
        if(!tasks.length) return []

        const ids = new Set(tasks.map((task) => task.id))
        const childrenOf = (parent: string) => tasks
            .filter((task) => (ids.has(task.parent) ? task.parent : '') === parent)
            .sort((a, b) => Number(a.done) - Number(b.done) || a.position.localeCompare(b.position))

        // Subtasks nest under their parent, a parent that is gone leaves them on top
        const lines: string[] = []
        const write = (task: Task, depth: number) => {
            const indent = '  '.repeat(depth)
            lines.push(`${indent}- [${task.done ? 'x' : ' '}] ${task.title}${task.due && !task.done ? ` · due ${dueText(task.due)}` : ''}`)
            for(const line of task.notes ? task.notes.split('\n') : []) lines.push(`${indent}  ${line}`)
            for(const child of childrenOf(task.id)) write(child, depth + 1)
        }
        for(const task of childrenOf('')) write(task, 0)

        // Past days still count, the reminder lands finished
        const reminders = tasks.flatMap(({ due, done }) => due && !done ? [{
            at: due.at.toISOString(),
            ...repeatOf(recurrences.get(due.recurrence), due),
            timezone: due.timezone,
            rules: [],
            task: true
        }] : [])

        return [withTitle(text(taskList.title).trim(), lines.join('\n'), {
            source: `tasks:${text(taskList.id) || text(taskList.title)}`,
            color: '',
            labels: [],
            pinned: false,
            archived: false,
            position: Date.parse(text(taskList.updated)) || Date.now(),
            reminders
        })]
    })
}

// Takeout now gives the moment in scheduled_time, older exports only a day in due
function dueOf(item: Record<string, unknown>, timezone: string, recurrence: string): Due | null {
    const scheduled = list(item.scheduled_time).filter(isRecord)
    const start = Date.parse(text((scheduled.find((entry) => entry.current === true) ?? scheduled[0])?.start))
    if(Number.isFinite(start)){
        const at = new Date(start)
        const { hour, minute } = clockOf(at, timezone)

        // A task with only a day shows up as midnight
        if(hour || minute) return { at, timezone, allDay: false, recurrence }
        return { at: dayAt(localDay(at, timezone), DUE_HOUR, timezone), timezone, allDay: true, recurrence }
    }

    const day = text(item.due).slice(0, 10)
    if(/^\d{4}-\d{2}-\d{2}$/.test(day)) return { at: dayAt(day, DUE_HOUR, timezone), timezone, allDay: true, recurrence }
    return null
}

function dueText(due: Due) {
    const day = localDay(due.at, due.timezone)
    if(due.allDay) return day
    const { hour, minute } = clockOf(due.at, due.timezone)
    return `${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// A schedule this app can't follow leaves a reminder that goes off once
function repeatOf(schedule: Record<string, unknown> | undefined, due: Due): Repeat {
    const once: Repeat = { repeat: 'never', every: 1, weekdays: [], until: '' }
    const interval = schedule?.interval
    if(!schedule || !isRecord(interval)) return once

    const every = Math.min(Math.max(Math.floor(Number(interval.interval_multiplier)) || 1, 1), LIMITS.REMINDER_EVERY)
    let repeat: Repeat = once
    if(isRecord(interval.daily)) repeat = { ...once, repeat: 'days', every }
    else if(isRecord(interval.monthly)) repeat = { ...once, repeat: 'months', every }
    else if(isRecord(interval.yearly)) repeat = { ...once, repeat: 'years', every }
    else if(isRecord(interval.weekly)){
        const days = list(interval.weekly.day_of_week).flatMap((day) => WEEKDAYS[text(day)] ?? [])
        if(days.length <= 1) repeat = { ...once, repeat: 'weeks', every }
        else if(every === 1) repeat = { ...once, repeat: 'weekdays', weekdays: days }
    }
    if(repeat.repeat === 'never') return once

    // An end counted in rounds becomes the moment of the last one
    const end = schedule.end_condition
    if(end === undefined) return repeat
    const rounds = isRecord(end) ? Math.floor(Number(end.instance_number_limit)) : NaN
    const first = text(schedule.first_instance_date).slice(0, 10)
    if(!(rounds >= 1 && rounds <= LARGEST_ROUNDS) || !/^\d{4}-\d{2}-\d{2}$/.test(first)) return once

    const rule = { ...repeat, at: sameClockOn(first, due.at, due.timezone).toISOString(), timezone: due.timezone }
    let last: Date | null = new Date(rule.at)
    for(let round = 1; round < rounds && last; round++) last = occurrenceAfter(rule, last)
    return last ? { ...repeat, until: last.toISOString() } : once
}

function zoneOf(schedule: Record<string, unknown> | undefined) {
    const zone = text(schedule?.time_zone)
    if(!zone) return null
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone }
    catch { return null }
}

// Day like 2026-12-31 on the clock of the zone
function localDay(date: Date, timezone: string) {
    return date.toLocaleDateString('sv-SE', { timeZone: timezone })
}



// HELPERS ====================================================================================================

// A title past the limit moves into the body whole, the title keeps its start
function withTitle(title: string, body: string, rest: Omit<ImportedNote, 'title' | 'body'>): ImportedNote {
    if(title.length <= LIMITS.NOTE_TITLE) return { ...rest, title, body }
    return { ...rest, title: `${title.slice(0, LIMITS.NOTE_TITLE - 1)}…`, body: `${title}\n\n${body}` }
}

export function tooLong(note: ImportedNote): string | null {
    if(note.body.length > LIMITS.NOTE_BODY) return `Left out, the text is longer than ${LIMITS.NOTE_BODY} characters`
    return null
}

function labelNames(names: string[]) {
    const unique = new Map<string, string>()
    for(const name of names){
        const trimmed = name.trim().slice(0, LIMITS.LABEL_NAME).trim()
        if(trimmed && !unique.has(trimmed.toLowerCase())) unique.set(trimmed.toLowerCase(), trimmed)
    }
    return [...unique.values()].slice(0, LIMITS.NOTE_LABELS)
}

function microseconds(value: unknown) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.floor(number / 1000) : null
}

function oneLine(value: string) {
    return value.replace(/\s*\n\s*/g, ' ')
}

function text(value: unknown) {
    return typeof value === 'string' ? value : ''
}

function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
