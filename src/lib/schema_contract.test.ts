import { NOTE_COLORS } from '#lib/note_colors.ts';
import { REPEATS, WEEKDAY_CODES } from '#lib/reminders.ts';
import { IMAGE_THUMB, IMAGE_TYPES, LIMITS, UPLOAD_FORM_OVERHEAD } from '#lib/schema_limits.ts';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

type Field = { name: string, max?: number, maxSelect?: number, maxSize?: number, mimeTypes?: string[], thumbs?: string[], values?: string[], pattern?: string }
type Collection = { name: string, fields: Field[] }

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const schema: Collection[] = JSON.parse(read('pocketbase/pb_schema.json'))

function field(collection: string, name: string): Field {
    const found = schema.find((one) => one.name === collection)?.fields.find((one) => one.name === name)
    if(!found) throw new Error(`pb_schema.json has no ${collection}.${name}`)
    return found
}

// The database enforces its own copy of what zod checks | when they part, a save passes validation and then fails on the way in
describe('pb_schema.json and the zod limits', () => {

    test.each([
        ['labels', 'name', LIMITS.LABEL_NAME],
        ['notes', 'title', LIMITS.NOTE_TITLE],
        ['notes', 'body', LIMITS.NOTE_BODY],
        ['reminders', 'every', LIMITS.REMINDER_EVERY],
        ['reminders', 'timezone', LIMITS.TIMEZONE],
        ['occurrences', 'rule', LIMITS.OCCURRENCE_RULE],
        ['occurrences', 'comment', LIMITS.OCCURRENCE_COMMENT],
        ['occurrences', 'timezone', LIMITS.TIMEZONE],
        ['views', 'name', LIMITS.VIEW_NAME],
        ['views', 'icon', LIMITS.VIEW_ICON],
        ['push_subscriptions', 'endpoint', LIMITS.PUSH_ENDPOINT],
        ['push_subscriptions', 'p256dh', LIMITS.PUSH_P256DH],
        ['push_subscriptions', 'auth', LIMITS.PUSH_AUTH],
        ['users', 'ntfyTopic', LIMITS.NTFY_TOPIC],
        ['users', 'name', LIMITS.USER_NAME],
        ['notes', 'position', LIMITS.NOTE_POSITION],
    ])('%s.%s holds what zod lets through', (collection, name, most) => {
        expect(field(collection, name).max).toBe(most)
    })

    test.each([
        ['labels', LIMITS.NOTE_LABELS],
        ['images', LIMITS.NOTE_IMAGES],
        ['attachments', LIMITS.NOTE_ATTACHMENTS],
        ['shared', LIMITS.NOTE_SHARES],
    ])('notes.%s takes as many as zod', (name, most) => {
        expect(field('notes', name).maxSelect).toBe(most)
    })

    test.each(['images', 'attachments'])('notes.%s takes the largest file an admin may allow', (name) => {
        expect(field('notes', name).maxSize).toBe(LIMITS.UPLOAD_BYTES)
    })

    test('BODY_SIZE_LIMIT in the Dockerfile lets the largest file and its form through', () => {
        const [, amount, unit] = read('Dockerfile').match(/BODY_SIZE_LIMIT=(\d+)([KMG]?)/) ?? []
        const bytes = Number(amount) * 1024 ** ' KMG'.indexOf(unit || ' ')
        expect(bytes).toBeGreaterThanOrEqual(LIMITS.UPLOAD_BYTES + UPLOAD_FORM_OVERHEAD)
    })

    test('notes.images takes the types and thumb the routes offer', () => {
        expect(field('notes', 'images').mimeTypes?.toSorted()).toEqual(IMAGE_TYPES.toSorted())
        expect(field('notes', 'images').thumbs).toEqual([IMAGE_THUMB])
    })

    test.each(['labels', 'notes'])('%s.color knows every color', (collection) => {
        expect(field(collection, 'color').values?.toSorted()).toEqual([...NOTE_COLORS].toSorted())
    })

    test('reminders know every repeat and weekday', () => {
        expect(field('reminders', 'repeat').values?.toSorted()).toEqual([...REPEATS].toSorted())
        expect(field('reminders', 'weekdays').values?.toSorted()).toEqual([...WEEKDAY_CODES].toSorted())
    })

})

// Server reads filter with the same rule the database enforces | the module needs the server env, so its source is read instead
describe('note access', () => {

    const notes = (schema as (Collection & { listRule: string, viewRule: string })[]).find((one) => one.name === 'notes')
    const access = read('src/lib/server/note_access.ts').match(/ACCESS = '\((.+)\)'/)?.[1]

    test.each(['listRule', 'viewRule'] as const)('notes.%s matches ACCESS', (rule) => {
        expect(notes?.[rule].replaceAll('@request.auth.id', '{:user}')).toBe(access)
    })

})

describe('app.css', () => {

    const css = read('src/app.css')
    const compact = css.slice(css.indexOf(":root[data-density='compact'] :is(.note-grid, .note) {"))
    const rem = (token: string, tokens: string) => Number(tokens.match(new RegExp(`--${token}: ([\\d.]+)rem`))?.[1])
    const breakpoints = [...css.matchAll(/@container \(width < ([\d.]+)rem\)/g)].map((match) => Number(match[1]))

    // Comfortable comes first in app.css, compact second
    test.each([['comfortable', 0, css], ['compact', 1, compact]] as const)('the %s one column breakpoint leaves no room for two notes and their gap', (_, index, tokens) => {
        const breakpoint = breakpoints[index]
        expect(breakpoint).toBeGreaterThanOrEqual(2 * rem('layout-note-min', tokens) + rem('layout-note-gap', tokens))
        expect(css).toContain(`@container (width >= ${breakpoint}rem)`)
    })

    test('compact keeps two columns until auto fit finds room for two max width notes', () => {
        const top = Number(css.match(/@container \([\d.]+rem <= width < ([\d.]+)rem\)/)?.[1])
        expect(top).toBeGreaterThanOrEqual(2 * rem('layout-note-max', compact) + rem('layout-note-gap', compact))
    })

})

describe('note_colors.css', () => {

    const css = read('src/lib/note_colors.css')

    test.each([...NOTE_COLORS])('%s has a rule', (color) => {
        expect(css).toContain(`[data-note='${color}']`)
    })

})
