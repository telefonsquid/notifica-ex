import type { Note } from '#lib/schemas.ts';

/*
    State of the one reminder history dialog in the app layout. Cards open it for a note,
    and it grows out of whichever button asked for it, dressed like that note.
*/

export const HISTORY_PAGE = 50

type HistoryNote = Pick<Note, 'id' | 'title' | 'color'>

export const history = $state({
    open: false,
    note: { id: '', title: '', color: '' } as HistoryNote,
    limit: HISTORY_PAGE,                // grows a page at a time, a minute reminder logs a lot
    anchor: null as HTMLElement | null
})

export function showHistory(note: HistoryNote, anchor?: HTMLElement){
    history.note = { id: note.id, title: note.title, color: note.color }
    history.limit = HISTORY_PAGE
    history.anchor = anchor ?? null
    history.open = true
}
