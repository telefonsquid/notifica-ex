import { afterSave, changedFields, fitted, holdSave, parseDraft, rescued, restoreOf, sameContent, saveOpenNotes } from '#lib/drafts.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import type { Note, NoteContent } from '#lib/schemas.ts';
import { describe, expect, test } from 'bun:test';

const content = (title: string, body = ''): NoteContent => ({ title, body, color: '', labels: [], pinned: false, archived: false })
const note = (id: string, title: string, body = '') => ({ id, ...content(title, body) }) as Note

describe('a draft the server would refuse', () => {
    test('a title running over moves into the text', () => {
        const fit = fitted(content('x'.repeat(LIMITS.NOTE_TITLE) + 'more', 'text'))
        expect(fit.title.length).toBe(LIMITS.NOTE_TITLE)
        expect(fit.body).toBe('more\n\ntext')
    })

    test('an overlong text loses its end', () => {
        const fit = fitted(content('t', 'x'.repeat(LIMITS.NOTE_BODY + 5)))
        expect(fit.body.length).toBe(LIMITS.NOTE_BODY)
    })

    test('labels gone meanwhile come off, without a list all of them stay', () => {
        const labelled = { ...content('t'), labels: ['a', 'gone'] }
        expect(fitted(labelled, ['a']).labels).toEqual(['a'])
        expect(fitted(labelled).labels).toEqual(['a', 'gone'])
    })

    test('one that fits stays the same', () => {
        expect(sameContent(fitted(content('t', 'b'), []), content('t', 'b'))).toBe(true)
    })
})

describe('a stored draft', () => {
    const good = { owner: 'me', tab: 'a', content: content('t') }

    test('reads back', () => {
        expect(parseDraft(JSON.stringify(good))).toEqual(good)
    })

    test('anything else counts as broken', () => {
        for(const raw of [null, '', '{"owner"', '{}', '[]', 'null', '{"owner":"me","tab":"a"}', '{"owner":"me","tab":"a","content":{"title":1}}', JSON.stringify({ ...good, base: {} })]){
            expect(parseDraft(raw)).toBeNull()
        }
    })
})

describe('logging out', () => {
    test('waits for every open card, a closed one is out of it', async () => {
        const saved: string[] = []
        const leave = holdSave(async () => {
            await Bun.sleep(1)
            saved.push('open')
        })
        holdSave(async () => { saved.push('closed') })()

        await saveOpenNotes()
        leave()
        await saveOpenNotes()
        expect(saved).toEqual(['open'])
    })
})

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

describe('edits on a note that is out of reach', () => {
    test('typed text is kept', () => {
        expect(rescued(content('typed'), { title: 'typed' }, true)).toEqual(content('typed'))
    })

    test('a copy of someone else\'s note leaves their labels and flags behind', () => {
        const theirs = { ...content('typed'), labels: ['theirs'], archived: true, pinned: true }
        expect(rescued(theirs, { body: 'typed' }, false)).toEqual(content('typed'))
    })

    test('a press on archive or a colour leaves nothing to keep', () => {
        expect(rescued(content('title'), { archived: true }, true)).toBeNull()
    })
})

describe('comparing content', () => {
    test('looks at every field', () => {
        expect(sameContent(content('a'), content('a'))).toBe(true)
        expect(sameContent(content('a'), { ...content('a'), pinned: true })).toBe(false)
        expect(sameContent(content('a'), { ...content('a'), labels: ['x'] })).toBe(false)
    })
})
