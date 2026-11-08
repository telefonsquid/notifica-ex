import { invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import { createLock, keyOf, openLock, seal, unseal } from '#lib/note_crypto.ts';
import type { Note } from '#lib/schemas/notes.ts';
import { kept } from '#lib/note_list.ts';
import { safeAction } from '#lib/safe_action.ts';
import { askPassword } from '#lib/singletons/password.svelte.ts';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { lockNote, unlockNote } from '../routes/api/notes.remote';
import { startNoteLock } from '../routes/api/users.remote';

/*
    The unlocked state of locked notes in this tab. Each note opens with its own password entry and stays
    open until the key goes. The key lives in memory only, a reload or a long absence forgets it.
    Bodies get decrypted once and cached by their ciphertext.
*/

// A tab hidden this long locks again, unless a locked note is open in it
const RELOCK_AFTER = 5 * 60_000

const state = $state({ key: null as CryptoKey | null, id: '' })
const bodies = new SvelteMap<string, string | null>()      // Null for ones this key can't open
const revealed = new SvelteSet<string>()                    // Ids of notes unlocked in this tab
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const pending = new Set<string>()                           // Plain on purpose | written while a derived runs, a reactive set would throw there
let holds = 0

export const noteLock = {
    get unlocked() { return !!state.key },
}

// The key this account seals with, empty before the first lock
export function accountKeyId(): string {
    return page.data.user?.noteLock?.id ?? ''
}

// Sealed under a key gone with a password reset
export function lost(note: Pick<Note, 'sealed'>): boolean {
    return !!note.sealed && keyOf(note.sealed) !== accountKeyId()
}



// SHOWING ====================================================================================================
// Locked notes with their text once it is known, an empty body and unreadable until then
export function reveal<T extends Note>(notes: T[]): T[] {
    return notes.map((note) => note.sealed ? revealOne(note) : note)
}

export function revealOne<T extends Note>(note: T): T {
    if(!note.sealed) return note
    if(!revealed.has(note.id)) return { ...note, body: '', unreadable: true }
    const body = bodies.get(note.sealed)
    if(typeof body === 'string') return { ...note, body, unreadable: false }
    if(body === undefined) open(note.sealed)
    return { ...note, body: '', unreadable: true }
}

function open(sealed: string){
    const { key, id } = state
    if(!key || keyOf(sealed) !== id || pending.has(sealed)) return
    pending.add(sealed)

    // Out of the derived that asked, it may not write state
    queueMicrotask(async () => {
        const body = await unseal(key, sealed)
        pending.delete(sealed)
        if(state.key === key) bodies.set(sealed, body)
    })
}

// Asks the password for this one note before its card opens, false when it stays closed
export async function readable(note: Pick<Note, 'id' | 'sealed'>): Promise<boolean> {
    const { sealed } = note
    if(!sealed) return true
    if(lost(note)) return false
    if(revealed.has(note.id) && typeof bodies.get(sealed) === 'string') return true

    const stored = page.data.user?.noteLock
    if(!stored) return false
    return askPassword({
        title: 'Unlock note',
        message: 'Your account password opens this note.',
        action: 'Unlock',
        check: async (password) => {
            const key = await openLock(stored, password)
            if(!key) return 'Wrong password.'
            take(key, stored.id)

            const body = bodies.get(sealed) ?? await unseal(key, sealed)
            if(body === null) return 'This note does not open with your password.'
            bodies.set(sealed, body)
            revealed.add(note.id)
            return null
        }
    })
}

// A note locked in this tab stays readable here
export function markRevealed(id: string){
    revealed.add(id)
}

// Throws without a key, a locked body must never go out readable
export async function sealBody(body: string): Promise<string> {
    const { key, id } = state
    if(!key) throw new Error('Locked notes are closed, unlock them first.')
    const sealed = await seal(key, id, body)
    bodies.set(sealed, body)
    return sealed
}



// LOCKING ====================================================================================================
// For a closed card, an open one saves its draft first through its session
export async function toggleLock(note: Note): Promise<Note | null> {
    if(note.sealed){
        if(!await readable(note)) return null
        return safeAction(kept(unlockNote({ id: note.id, body: bodies.get(note.sealed)! })))
    }
    if(!await ensureKey()) return null
    markRevealed(note.id)
    return safeAction(kept(sealBody(note.body).then((sealed) => lockNote({ id: note.id, sealed }))))
}



// KEY ======================================================================================================
// The key for sealing, asked for once per tab | the first time it sets the lock up
export async function ensureKey(): Promise<boolean> {
    if(state.key) return true
    const stored = page.data.user?.noteLock

    if(stored) return askPassword({
        title: 'Lock note',
        message: 'Your account password locks this note.',
        action: 'Lock',
        check: async (password) => {
            const key = await openLock(stored, password)
            if(!key) return 'Wrong password.'
            take(key, stored.id)
            return null
        }
    })

    return askPassword({
        title: 'Lock notes',
        message: 'Locked notes are encrypted with your account password. Changing it in Settings keeps them, a password reset by mail makes them unreadable.',
        action: 'Lock',
        check: async (password) => {
            const { lock, key } = await createLock(password)
            try {
                await startNoteLock({ password, noteLock: lock })
            } catch (err) {
                return (err as { body?: { message?: string } })?.body?.message ?? 'Could not set up locked notes.'
            }
            await invalidateAll()
            take(key, lock.id)
            return null
        }
    })
}

// After a password change the same key stays, only the lock around it changed
export function take(key: CryptoKey, id: string){
    if(state.key && state.id === id) return
    if(state.id !== id) bodies.clear()
    state.key = key
    state.id = id
}

export function forgetKey(){
    state.key = null
    state.id = ''
    bodies.clear()
    revealed.clear()
    pending.clear()
}

// An open locked note keeps the tab unlocked | returns the release
export function holdKey(): () => void {
    holds++
    let released = false
    return () => {
        if(released) return
        released = true
        holds--
    }
}

if(typeof document !== 'undefined'){
    let hiddenAt = 0
    document.addEventListener('visibilitychange', () => {
        if(document.hidden) hiddenAt = Date.now()
        else if(hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER && !holds) forgetKey()
    })
}
