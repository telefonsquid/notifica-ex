import { afterSave, changedFields, restoreOf, sameContent } from '#lib/drafts.ts';
import type { Note, NoteContent } from '#lib/schemas.ts';
import { describe, expect, test } from 'bun:test';

const content = (title: string, body = ''): NoteContent => ({ title, body, color: '', labels: [], pinned: false, archived: false })
const note = (id: string, title: string, body = '') => ({ id, ...content(title, body) }) as Note

describe('restoring a draft', () => {
    test('a new note gets created', () => {
        expect(restoreOf({ owner: 'me', content: content('new'), tab: 'a' }, [])).toBe('create')
    })

    test('a new note whose save landed before the page went is not made twice', () => {
        expect(restoreOf({ owner: 'me', content: content('new', 'text'), tab: 'a' }, [note('1', 'new', 'text')])).toBe('drop')
    })

    test('edits go onto an unchanged note', () => {
        expect(restoreOf({ owner: 'me', id: '1', base: content('old'), content: content('edit'), tab: 'a' }, [note('1', 'old')])).toBe('update')
    })

    test('edits whose save landed have nothing left to do', () => {
        expect(restoreOf({ owner: 'me', id: '1', base: content('old'), content: content('edit'), tab: 'a' }, [note('1', 'edit')])).toBe('drop')
    })

    test('a note changed elsewhere stays, the edits become a note of their own', () => {
        expect(restoreOf({ owner: 'me', id: '1', base: content('old'), content: content('edit'), tab: 'a' }, [note('1', 'other')])).toBe('create')
    })

    test('edits to a note that is gone become a note of their own', () => {
        expect(restoreOf({ owner: 'me', id: '1', base: content('old'), content: content('edit'), tab: 'a' }, [])).toBe('create')
    })
})

describe('saving only what changed', () => {
    test('sends the fields edited on this card and nothing else', () => {
        expect(changedFields(content('old', 'body'), content('new', 'body'))).toEqual({ title: 'new' })
    })

    test('a save after a change elsewhere keeps that change', () => {
        const base = content('old', 'body')
        const sent = changedFields(base, content('new', 'body'))
        const stored = { ...content('new', 'from elsewhere'), pinned: true }
        const { saved, adopted } = afterSave(base, sent, content('new', 'body'), stored)

        expect(sent).toEqual({ title: 'new' })
        expect(adopted).toEqual({ body: 'from elsewhere', pinned: true })
        expect(saved).toEqual(stored)
    })

    test('typing during the save stays unsaved and is not replaced', () => {
        const base = content('old', 'body')
        const { saved, adopted } = afterSave(base, { title: 'new' }, content('newer', 'typed'), content('new', 'from elsewhere'))

        expect(adopted).toEqual({})
        expect(saved.title).toBe('new')
        expect(saved.body).toBe('from elsewhere')
    })

    test('what was sent counts as saved even if the server tidied it', () => {
        const { saved, adopted } = afterSave(content('a'), { title: ' b ' }, content(' b '), content('b'))
        expect(saved.title).toBe(' b ')
        expect(adopted).toEqual({})
    })

    test('keeps the order of the fields, the card compares them as text', () => {
        const current = content('a')
        const stored: NoteContent = { archived: false, pinned: false, labels: [], color: '', body: '', title: 'a' }
        expect(JSON.stringify(afterSave(current, {}, current, stored).saved)).toBe(JSON.stringify(current))
    })
})

describe('comparing content', () => {
    test('looks at every field', () => {
        expect(sameContent(content('a'), content('a'))).toBe(true)
        expect(sameContent(content('a'), { ...content('a'), pinned: true })).toBe(false)
        expect(sameContent(content('a'), { ...content('a'), labels: ['x'] })).toBe(false)
    })
})
