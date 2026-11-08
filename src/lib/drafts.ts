import { LIMITS } from '#lib/schema_limits.ts';
import { emptyNote } from '#lib/notes.ts';
import type { Note, NoteContent } from '#lib/schemas/notes.ts';

/*
    Unsaved notes also wait in this browser, so a reload during an outage or a killed app can't lose them.
    The next page load hands them to the server.
*/

// PLAN ============================================================
type Draft = {
    owner: string           // Another account on this browser leaves it alone
    id?: string             // Empty while the note was never stored
    base?: NoteContent      // The stored note the edits started from
    content: NoteContent
    tab: string             // The page that wrote it, a live one still looks after it on its own
}

type Restore = 'drop' | 'update' | 'create'

export function sameContent(a: NoteContent, b: NoteContent): boolean {
    return (Object.keys(emptyNote()) as (keyof NoteContent)[]).every((key) => sameField(a[key], b[key]))
}

// A save may have landed just before the page went | a note changed elsewhere meanwhile stays as it is and the edits become their own note
export function restoreOf(draft: Draft, notes: Note[]): Restore {
    if(!draft.id) return notes.some((note) => note.title === draft.content.title && note.body === draft.content.body) ? 'drop' : 'create'

    const note = notes.find((item) => item.id === draft.id)
    if(!note) return 'create'
    if(sameContent(note, draft.content)) return 'drop'
    return draft.base && sameContent(note, draft.base) ? 'update' : 'create'
}



// SAVING ============================================================
function sameField(a: NoteContent[keyof NoteContent], b: NoteContent[keyof NoteContent]){
    return Array.isArray(a) && Array.isArray(b) ? a.join() === b.join() : a === b
}

// What a save has to send | another device may have changed the rest since this card opened
export function changedFields(base: NoteContent, draft: NoteContent): Partial<NoteContent> {
    const keys = Object.keys(draft) as (keyof NoteContent)[]
    return Object.fromEntries(keys.filter((key) => !sameField(base[key], draft[key])).map((key) => [key, draft[key]]))
}

// Where a card stands once a save came back | fields left alone take what is stored, unless typing went on meanwhile
export function afterSave(base: NoteContent, sent: Partial<NoteContent>, current: NoteContent, stored: NoteContent) {
    const saved: Record<string, unknown> = {}
    const adopted: Record<string, unknown> = {}

    for(const key of Object.keys(current) as (keyof NoteContent)[]){
        saved[key] = key in sent ? sent[key] : stored[key]
        if(!(key in sent) && sameField(current[key], base[key]) && !sameField(current[key], stored[key])) adopted[key] = stored[key]
    }
    return { saved: saved as NoteContent, adopted: adopted as Partial<NoteContent> }
}



// Text worth keeping when its note is out of reach | what is left of someone else's note starts plain
export function rescued(content: NoteContent, sent: Partial<NoteContent>, owned: boolean): NoteContent | null {
    if(!('title' in sent) && !('body' in sent)) return null
    return owned ? content : { ...content, labels: [], pinned: false, archived: false }
}



// What the server accepts, for a draft nobody can correct anymore | a title running over moves into the text, only the end of an overlong text gets lost
export function fitted(content: NoteContent, known?: string[]): NoteContent {
    const over = content.title.slice(LIMITS.NOTE_TITLE)
    const body = over ? `${over}\n\n${content.body}` : content.body

    return {
        ...content,
        title: content.title.slice(0, LIMITS.NOTE_TITLE),
        body: body.slice(0, LIMITS.NOTE_BODY),
        labels: known ? content.labels.filter((label) => known.includes(label)) : content.labels,
    }
}



// LOGOUT ============================================================
const openNotes = new Set<() => Promise<unknown>>()

// A card that may hold unsaved text registers while it is open
export function holdSave(save: () => Promise<unknown>){
    openNotes.add(save)
    return () => { openNotes.delete(save) }
}

// The session is about to end, a save after that has no way in
export async function saveOpenNotes(){
    await Promise.all([...openNotes].map((save) => save()))
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

// Empty for anything a draft never looks like, cut off by a full disk for example
export function parseDraft(raw: string | null): Draft | null {
    try{
        const draft = JSON.parse(raw ?? '')
        const looksRight = (content: NoteContent) => typeof content?.title === 'string' && typeof content.body === 'string' && Array.isArray(content.labels)
        return typeof draft?.owner === 'string' && typeof draft.tab === 'string' && looksRight(draft.content) && (!draft.base || looksRight(draft.base)) ? draft : null
    }catch{
        return null
    }
}

// Drafts left behind by pages that are gone, this one's own don't count | the caller holds the lock of oneAtATime
export async function orphanedDrafts(owner: string): Promise<{ key: string, draft: Draft }[]> {
    const live = await liveTabs()
    const found: { key: string, draft: Draft }[] = []

    for(const name of Object.keys(localStorage)){
        if(!name.startsWith(PREFIX)) continue
        const draft = parseDraft(localStorage.getItem(name))
        if(!draft) localStorage.removeItem(name)
        else if(draft.owner === owner && draft.tab !== thisTab && !live.has(draft.tab)) found.push({ key: name.slice(PREFIX.length), draft })
    }
    return found
}

// Two pages loading together must not both send the same draft
export function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
    return navigator.locks ? navigator.locks.request('note-draft-restore', work) as Promise<T> : work()
}
