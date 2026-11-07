import type { Note, NoteContent } from '#lib/schemas.ts';

/*
    Unsaved notes also wait in this browser, so a reload during an outage or a killed app can't lose them.
    The next page load hands them to the server.
*/

// PLAN ============================================================
export type Draft = {
    owner: string           // Another account on this browser leaves it alone
    id?: string             // Empty while the note was never stored
    base?: NoteContent      // The stored note the edits started from
    content: NoteContent
    tab: string             // The page that wrote it, a live one still looks after it on its own
}

export type Restore = 'drop' | 'update' | 'create'

const FIELDS = ['title', 'body', 'color', 'pinned', 'archived'] as const

export function sameContent(a: NoteContent, b: NoteContent): boolean {
    return FIELDS.every((field) => a[field] === b[field]) && a.labels.join() === b.labels.join()
}

// A save may have landed just before the page went | a note changed elsewhere meanwhile stays as it is and the edits become their own note
export function restoreOf(draft: Draft, notes: Note[]): Restore {
    if(!draft.id) return notes.some((note) => note.title === draft.content.title && note.body === draft.content.body) ? 'drop' : 'create'

    const note = notes.find((item) => item.id === draft.id)
    if(!note) return 'create'
    if(sameContent(note, draft.content)) return 'drop'
    return draft.base && sameContent(note, draft.base) ? 'update' : 'create'
}



// STORAGE ============================================================
const PREFIX = 'note-draft:'
const TAB_LOCK = 'note-tab:'

export const thisTab = Math.random().toString(36).slice(2)
let claimed = false

// A full or blocked storage only costs the backup, the save itself goes on
export function keepDraft(key: string, draft: Omit<Draft, 'tab'>){
    try{
        localStorage.setItem(PREFIX + key, JSON.stringify({ ...draft, tab: thisTab }))
    }catch{ /* Nothing to do */ }
}

export function forgetDraft(key: string){
    localStorage.removeItem(PREFIX + key)
}

// Held until the page goes, however it goes | only secure pages have locks, the others look after every draft
export function claimTab(){
    if(claimed) return
    claimed = true
    navigator.locks?.request(TAB_LOCK + thisTab, () => new Promise(() => {}))
}

async function liveTabs(): Promise<Set<string>> {
    const { held = [] } = await navigator.locks?.query() ?? {}
    return new Set(held.map((lock) => lock.name?.slice(TAB_LOCK.length) ?? ''))
}

// Drafts left behind by pages that are gone, this one's own don't count | the caller holds the lock of oneAtATime
export async function orphanedDrafts(owner: string): Promise<{ key: string, draft: Draft }[]> {
    const live = await liveTabs()
    const found: { key: string, draft: Draft }[] = []

    for(let index = 0; index < localStorage.length; index++){
        const name = localStorage.key(index)
        if(!name?.startsWith(PREFIX)) continue
        const draft = JSON.parse(localStorage.getItem(name) ?? '{}') as Draft
        if(draft.owner === owner && draft.tab !== thisTab && !live.has(draft.tab)) found.push({ key: name.slice(PREFIX.length), draft })
    }
    return found
}

// Two pages loading together must not both send the same draft
export function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
    return navigator.locks ? navigator.locks.request('note-draft-restore', work) as Promise<T> : work()
}
