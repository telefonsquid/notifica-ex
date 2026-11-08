import { describe, expect, test } from 'bun:test';
import { keepNote, readTakeout, taskNotes } from '#lib/google_import.ts';
import { tasksOf } from '#lib/markdown.ts';
import { LIMITS } from '#lib/schema_limits.ts';

// KEEP =========================================================================================================
describe('keepNote', () => {
    const base = { isTrashed: false, isPinned: false, isArchived: false, title: 'Shopping', userEditedTimestampUsec: 1_700_000_000_000_000 }

    test('turns a list into a checklist with labels, colour and edit time', () => {
        const parsed = keepNote({
            ...base,
            color: 'CERULEAN',
            listContent: [{ text: 'Milk', isChecked: false }, { text: 'Bread\nrye', isChecked: true }],
            labels: [{ name: 'Home' }, { name: 'home' }, { name: ' Errands ' }]
        }, 'keep:Shopping.json')

        expect(parsed?.note).toEqual({
            source: 'keep:Shopping.json',
            title: 'Shopping',
            body: '- [ ] Milk\n- [x] Bread rye',
            color: 'cobalt',
            labels: ['Home', 'Errands'],
            pinned: false,
            archived: false,
            position: 1_700_000_000_000
        })
    })

    test('keeps text, adds links not in it and lists files', () => {
        const parsed = keepNote({
            ...base,
            textContent: 'See https://a.example\n',
            annotations: [{ url: 'https://a.example' }, { url: 'https://b.example' }],
            attachments: [{ filePath: 'photo.jpeg', mimetype: 'image/jpeg' }]
        }, 'keep:x.json')

        expect(parsed?.note.body).toBe('See https://a.example\n\nhttps://b.example')
        expect(parsed?.files).toEqual([{ path: 'photo.jpeg', type: 'image/jpeg' }])
    })

    test('leaves out trash, empty notes and other JSON', () => {
        expect(keepNote({ ...base, isTrashed: true, textContent: 'x' }, 'keep:a')).toBeNull()
        expect(keepNote({ ...base, title: '', textContent: '  ' }, 'keep:a')).toBeNull()
        expect(keepNote({ kind: 'tasks#taskLists' }, 'keep:a')).toBeNull()
    })

    test('archived notes lose their pin', () => {
        const parsed = keepNote({ ...base, isPinned: true, isArchived: true, textContent: 'x' }, 'keep:a')
        expect(parsed?.note.pinned).toBe(false)
        expect(parsed?.note.archived).toBe(true)
    })

    test('a long title moves into the body', () => {
        const title = 'a'.repeat(LIMITS.NOTE_TITLE + 10)
        const parsed = keepNote({ ...base, title, textContent: 'body' }, 'keep:a')
        expect(parsed?.note.title.length).toBe(LIMITS.NOTE_TITLE)
        expect(parsed?.note.body).toBe(`${title}\n\nbody`)
    })
})



// TASKS ========================================================================================================
describe('taskNotes', () => {
    const tasks = {
        kind: 'tasks#taskLists',
        items: [
            {
                kind: 'tasks#taskList', id: 'list1', title: 'Errands', updated: '2026-01-02T03:04:05.000Z',
                items: [
                    { id: 'b', title: 'Second', position: '00002', status: 'needsAction', scheduled_time: [{ current: true, start: '2026-11-12T08:30:00Z' }] },
                    { id: 'a', title: 'First', position: '00001', status: 'completed', scheduled_time: [{ current: true, start: '2026-01-01T07:00:00Z' }] },
                    { id: 'r', title: 'Old round', position: '00006', status: 'completed', visibility: 'PAST_HIDDEN', task_recurrence_id: 'rec' },
                    { id: 'c', title: 'Sub', position: '00001', status: 'needsAction', parent: 'b', notes: 'two\nlines' },
                    { id: 'd', title: 'Gone', position: '00003', status: 'needsAction', deleted: true },
                    { id: 'e', title: 'Cleared', position: '00004', status: 'completed', hidden: true },
                    { id: 'f', title: 'Orphan', position: '00005', status: 'needsAction', parent: 'd' }
                ]
            },
            { kind: 'tasks#taskList', id: 'list2', title: 'Empty', items: [] }
        ]
    }

    test('one checklist per list, open first, subtasks nested, due dates on open ones', () => {
        const notes = taskNotes(tasks, 'Europe/Berlin')
        expect(notes).toHaveLength(1)
        expect(notes[0]).toMatchObject({ source: 'tasks:list1', title: 'Errands', position: Date.parse('2026-01-02T03:04:05.000Z') })
        expect(notes[0].body).toBe([
            '- [ ] Second · due 2026-11-12 09:30',
            '  - [ ] Sub',
            '    two',
            '    lines',
            '- [ ] Orphan',
            '- [x] First'
        ].join('\n'))
    })

    test('open scheduled tasks get a task reminder at their time', () => {
        const [note] = taskNotes(tasks, 'Europe/Berlin')
        expect(note.reminders).toEqual([{ at: '2026-11-12T08:30:00.000Z', repeat: 'never', every: 1, weekdays: [], until: '', timezone: 'Europe/Berlin', rules: [], task: true }])
    })

    const one = (task: object, list: object = {}) => taskNotes({ kind: 'tasks#taskLists', items: [{ id: 'l', title: 'L', ...list, items: [{ id: 't', title: 'T', ...task }] }] }, 'Europe/Berlin')[0]

    test('a task with only a day reminds at 7:00 in the zone', () => {
        const note = one({ scheduled_time: [{ current: true, start: '2026-12-11T23:00:00Z' }] })
        expect(note.body).toBe('- [ ] T · due 2026-12-12')
        expect(note.reminders?.[0].at).toBe('2026-12-12T06:00:00.000Z')
    })

    test('older exports with due keep the day, summer time moves the moment', () => {
        expect(one({ due: '2026-07-01T00:00:00.000Z' }).reminders?.[0].at).toBe('2026-07-01T05:00:00.000Z')
    })

    test('repeating tasks repeat, rounds counted from the first become an end', () => {
        const schedule = (interval: object, extra: object = {}) => ({ recurrences: [{ id: 'rec', schedule: { first_instance_date: '2026-11-01T00:00:00Z', interval, time_zone: 'Europe/Berlin', ...extra } }] })
        const task = { task_recurrence_id: 'rec', scheduled_time: [{ current: true, start: '2026-11-05T07:00:00Z' }] }

        expect(one(task, schedule({ daily: {}, interval_multiplier: 2 })).reminders?.[0]).toMatchObject({ at: '2026-11-05T07:00:00.000Z', repeat: 'days', every: 2, until: '' })
        expect(one(task, schedule({ monthly: { day_of_month: 5 }, interval_multiplier: 11 })).reminders?.[0]).toMatchObject({ repeat: 'months', every: 11 })
        expect(one(task, schedule({ weekly: { day_of_week: ['MONDAY', 'THURSDAY'] }, interval_multiplier: 1 })).reminders?.[0]).toMatchObject({ repeat: 'weekdays', weekdays: ['mo', 'th'] })
        expect(one(task, schedule({ daily: {}, interval_multiplier: 2 }, { end_condition: { instance_number_limit: 3 } })).reminders?.[0]).toMatchObject({ repeat: 'days', until: '2026-11-05T07:00:00.000Z' })
        expect(one(task, schedule({ daily: {} }, { end_condition: { end_date: 'unknown' } })).reminders?.[0]).toMatchObject({ repeat: 'never' })
    })

    test('task notes do not count as tasks', () => {
        expect(tasksOf(taskNotes(tasks, 'Europe/Berlin')[0].body)).toEqual([false, false, false, true])
    })
})



// TAKEOUT ======================================================================================================
describe('readTakeout', () => {
    test('reads Keep notes, their files and Tasks from a zip', async () => {
        const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
        const zip = zipOf({
            'Takeout/Notizen/Photo.json': encode({ isTrashed: false, title: 'Photo', textContent: '', attachments: [{ filePath: 'cat.jpeg', mimetype: 'image/jpeg' }, { filePath: 'gone.png', mimetype: 'image/png' }] }),
            'Takeout/Notizen/cat.jpg': new Uint8Array([1, 2, 3]),
            'Takeout/Tasks/Tasks.json': encode({ kind: 'tasks#taskLists', items: [{ id: 'l', title: 'L', items: [{ id: 't', title: 'T' }] }] }),
            'Takeout/archive_browser.html': new TextEncoder().encode('<html>')
        })

        const takeout = await readTakeout([new File([zip], 'takeout.zip')], 'UTC')
        expect(takeout.notes.map((note) => note.source)).toEqual(['keep:Photo.json', 'tasks:l'])
        expect(takeout.problems).toEqual([{ title: 'Photo', reason: '1 file missing from the export' }])

        const [image] = takeout.files.get('keep:Photo.json') ?? []
        expect(image.field).toBe('images')
        const file = await image.read()
        expect(file.name).toBe('cat.jpg')
        expect(file.type).toBe('image/jpeg')
        expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3])
    })
})

// Deflates every entry but the last, which stays stored
function zipOf(files: Record<string, Uint8Array<ArrayBuffer>>) {
    const parts: Uint8Array[] = []
    const directory: Uint8Array[] = []
    let offset = 0

    const names = Object.keys(files)
    for(const [index, name] of names.entries()){
        const raw = files[name]
        const stored = index === names.length - 1
        const data = stored ? raw : Bun.deflateSync(raw)
        const path = new TextEncoder().encode(name)

        const local = new DataView(new ArrayBuffer(30))
        local.setUint32(0, 0x04034b50, true)
        local.setUint16(8, stored ? 0 : 8, true)
        local.setUint32(18, data.length, true)
        local.setUint32(22, raw.length, true)
        local.setUint16(26, path.length, true)
        parts.push(new Uint8Array(local.buffer), path, data)

        const entry = new DataView(new ArrayBuffer(46))
        entry.setUint32(0, 0x02014b50, true)
        entry.setUint16(10, stored ? 0 : 8, true)
        entry.setUint32(20, data.length, true)
        entry.setUint32(24, raw.length, true)
        entry.setUint16(28, path.length, true)
        entry.setUint32(42, offset, true)
        directory.push(new Uint8Array(entry.buffer), path)

        offset += 30 + path.length + data.length
    }

    const size = directory.reduce((sum, part) => sum + part.length, 0)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, names.length, true)
    end.setUint16(10, names.length, true)
    end.setUint32(12, size, true)
    end.setUint32(16, offset, true)

    return new Blob([...parts, ...directory, new Uint8Array(end.buffer)].map((part) => part.slice()))
}
