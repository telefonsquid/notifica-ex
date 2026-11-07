import { restoreOf, sameContent } from '#lib/drafts.ts';
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

describe('comparing content', () => {
    test('looks at every field', () => {
        expect(sameContent(content('a'), content('a'))).toBe(true)
        expect(sameContent(content('a'), { ...content('a'), pinned: true })).toBe(false)
        expect(sameContent(content('a'), { ...content('a'), labels: ['x'] })).toBe(false)
    })
})
