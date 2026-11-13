import { SNOOZE_CHOICES } from '#lib/reminders.ts';
import type { Push } from '#lib/server/push.ts';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The service worker and the Android app read what the server sends without sharing its types | a rename here has to reach them too

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const ANDROID = 'src-tauri/gen/android/app/src/main/java/ex/notifica/app'

const worker = read('static/push-worker.js')
const notifier = read(`${ANDROID}/ReminderNotifier.kt`)
const service = read(`${ANDROID}/ReminderService.kt`)
const activity = read(`${ANDROID}/MainActivity.kt`)
const delivery = read(`${ANDROID}/ReminderDelivery.kt`)

describe('reminder pushes', () => {

    const shown = ['id', 'title', 'message', 'click', 'done', 'snooze'] satisfies (keyof Push)[]
    const shownInApp = [...shown, 'reschedule'] satisfies (keyof Push)[]

    test.each(shown)('the worker reads %s', (field) => {
        expect(worker).toContain(`push.${field}`)
    })

    test.each(shownInApp)('the app reads %s', (field) => {
        expect(notifier).toContain(`"${field}"`)
    })

    test('stream and alarms tell the same reminder time apart by its slot', () => {
        expect(notifier).toContain('"slot"')
        expect(delivery).toContain('"slot"')
    })

    test('the app reads the schedule entries', () => {
        expect(delivery).toContain('"entries"')
    })

    test('the app resumes its stream from the cursor', () => {
        expect(service).toContain('"cursor"')
    })

    test.each([...SNOOZE_CHOICES])('the worker and the app offer snoozing by %s', (choice) => {
        expect(worker).toContain(`'${choice}'`)
        expect(notifier).toContain(`"${choice}"`)
    })

    test('the app waits longer than two heartbeats before it calls the stream dead', () => {
        const timeout = Number(service.match(/READ_TIMEOUT = ([\d_]+)/)?.[1].replaceAll('_', ''))
        const heartbeat = Number(read('src/lib/server/app_stream.ts').match(/HEARTBEAT = ([\d_]+)/)?.[1].replaceAll('_', ''))
        expect(timeout).toBeGreaterThan(2 * heartbeat)
    })

})

describe('Android bridge', () => {

    const exposed = [...activity.matchAll(/@JavascriptInterface\s+fun (\w+)/g)].map((match) => match[1])
    const typed = [...read('src/lib/android.ts').matchAll(/^\s{12}(\w+)\??\(/gm)].map((match) => match[1])
    const connect = [...read('src-tauri/connect/index.html').matchAll(/NotificaAndroid\?\.(\w+)/g)].map((match) => match[1])

    test.each([...typed, ...connect])('MainActivity offers %s', (name) => {
        expect(exposed).toContain(name)
    })

    test('the event the pages listen to is the one MainActivity sends', () => {
        expect(read('src/lib/android.ts')).toContain(`addEventListener('notifica-android'`)
        expect(activity).toContain(`new Event('notifica-android')`)
    })

})
