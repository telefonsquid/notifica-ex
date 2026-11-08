import { beforeNavigate, goto } from '$app/navigation';
import { afterSave, changedFields, fitted, forgetDraft, holdSave, keepDraft, rescued, sameContent, thisTab } from '#lib/drafts.ts';
import { dropNotes, kept } from '#lib/note_list.ts';
import { revealOne, sealBody, unlockNotes } from '#lib/note_lock.svelte.ts';
import { offerArchiveUndo, removeNotes } from '#lib/note_removal.ts';
import { archiveChange, contentOf, emptyNote, isEmpty } from '#lib/notes.ts';
import { notify } from '#lib/notifications.svelte.ts';
import { safeAction } from '#lib/safe_action.ts';
import type { Note, NoteContent } from '#lib/schemas/notes.ts';
import { serverStatus } from '#lib/singletons/server_status.svelte.ts';
import { untrack } from 'svelte';
import { createNote, lockNote, unlockNote, updateNote } from '../routes/api/notes.remote';

// A page still here after this long stayed, a download link for example
const LEAVE_GRACE = 10_000

type Options = {
    note: () => Note | null
    open: () => boolean
    me: () => string
    fresh: () => Partial<NoteContent>       // What a new note begins with
    unsaved: () => boolean                  // Content from outside has to be stored without a keystroke
    created: (id: string) => void
    close: () => void
}

/*
    The text of one note on its way to the server: the draft, its autosave and its backup in this browser.
    Created while a component starts up, its effects live as long as that card.
*/
export class NoteSession {
    #options: Options

    id = $state<string>()
    draft = $state<NoteContent>(emptyNote())     // Edited freely while open, follows the stored note while closed
    owned = $derived.by(() => {
        const note = this.#options.note()
        return !note || note.owner === this.#options.me()
    })

    #saved = $state.raw<NoteContent | null>(null)     // Empty while nothing of this draft is stored
    #savedAt = ''
    #unreadable = false             // Locked and not decrypted, its text arrives once the key does
    #deleted = false
    #signedOut = false
    #edited = false                 // Drafts only change on an open card, so the rest of the grid stays out of all this
    #leaving = false                // The next page may read its list before the last save lands, so the backup stays for it to compare
    #queue: Promise<unknown> = Promise.resolve()
    #backupKey: string

    constructor(options: Options){
        this.#options = options
        const initial = untrack(options.note)

        this.id = initial?.id
        this.draft = initial ? contentOf(initial) : { ...emptyNote(), ...untrack(options.fresh) }
        this.#saved = untrack(options.unsaved) ? null : $state.snapshot(this.draft)
        this.#savedAt = initial?.updated ?? ''
        this.#unreadable = !!initial?.unreadable
        this.#backupKey = `${initial?.id ?? `new-${Math.random().toString(36).slice(2)}`}.${thisTab}`     // Per tab, a save in one must not drop what another still holds

        this.#follow()
        this.#backUp()
        this.#autosave()
        this.#holdNavigation()
    }

    #isSaved(){
        return !!this.#saved && sameContent(this.draft, this.#saved)
    }

    // Changes from elsewhere land while closed and nothing is waiting to be saved | a copy not newer than the last save has nothing new, unless its text just got decrypted or locked away
    #follow(){
        const { note: current, open } = this.#options

        $effect.pre(() => {
            const note = current()
            if(!note) return
            const unlocked = this.#unreadable !== !!note.unreadable
            this.#unreadable = !!note.unreadable
            if(!unlocked && (open() || note.updated <= this.#savedAt)) return
            const saved = this.#saved
            if(!saved || !untrack(() => sameContent(this.draft, saved))) return

            this.draft = contentOf(note)
            this.#saved = contentOf(note)
            this.#savedAt = note.updated
        })

        $effect.pre(() => {
            if(open()) this.#edited = true
        })
    }

    // Whatever isn't stored yet also waits in this browser, see #lib/drafts.ts
    #backUp(){
        const { open, me, note } = this.#options

        // Locked text never lands readable in storage
        $effect(() => {
            if(!open() && !this.#edited) return
            if(note()?.sealed || this.#deleted || this.#isSaved() || (!this.id && isEmpty(this.draft))){
                if(!this.#leaving) forgetDraft(this.#backupKey)
            }
            else keepDraft(this.#backupKey, { owner: me(), id: this.id, base: this.#saved ?? undefined, content: $state.snapshot(this.draft) })
        })

        // Logout saves first
        $effect(() => {
            if(open()) return holdSave(this.save)
        })
    }

    // A moment after typing stops, right away once the note closes or goes
    #autosave(){
        const { open } = this.#options

        $effect(() => {
            if(!open()) return
            $state.snapshot(this.draft)
            const timer = setTimeout(this.save, 900)
            return () => clearTimeout(timer)
        })

        $effect(() => {
            if(!open()) untrack(this.save)
        })

        $effect(() => () => { this.save() })

        // A save lost to an outage goes out again once the server is back
        $effect(() => {
            if(!serverStatus.down) untrack(this.save)
        })
    }

    // Waits for unsaved changes, then goes where it was headed | back only closes the card, the root layout asks for that
    #holdNavigation(){
        beforeNavigate(({ cancel, to, type, willUnload }) => {

            // The session ended, a save has no way in anymore | what is left waits in the backup
            if(to?.route.id === '/login'){
                this.#signedOut = true
                return
            }

            if(!this.#options.open() || type === 'popstate' || this.#isSaved()) return

            // Closing or reloading goes through | a new note waits for the backup, sent now it could land twice
            if(type === 'leave') {
                this.#leaving = true
                setTimeout(() => this.#leaving = false, LEAVE_GRACE)
                if(this.id) this.save()
                return
            }

            cancel()
            this.save().then(() => {
                if(!this.#isSaved() || !to) return
                if(willUnload) location.href = to.url.href
                // eslint-disable-next-line svelte/no-navigation-without-resolve -- the router resolved it already
                else goto(to.url)
            })
        })
    }

    save = (): Promise<string | null> => this.#edited ? this.#write(false) : Promise.resolve(this.id ?? null)

    // Images and people need a stored note to hang on, even an empty one
    store = (): Promise<string | null> => this.#write(true)

    // One save at a time, a new note gets created exactly once
    #write(force: boolean): Promise<string | null> {
        const run = this.#queue.then(async () => {
            if(this.#deleted || this.#signedOut) return null
            if(!this.#options.open()) this.#fitClosed()

            const { id } = this
            if(this.#isSaved() && (id || !force)) return id ?? null
            if(!id && isEmpty(this.draft) && !force) return null

            const content = $state.snapshot(this.draft)
            const base = id && this.#saved ? this.#saved : content
            const sent = id ? changedFields(base, content) : content
            const result = await safeAction(id ? this.#sealed(sent).then((change) => kept(updateNote({ id, ...change }))).catch((err) => this.#gone(err, content, sent)) : kept(createNote(content)))
            if(result){
                if(!id) this.#options.created(result.id)
                this.id = result.id
                this.#savedAt = result.updated

                const settled = afterSave(base, sent, $state.snapshot(this.draft), revealOne(result))
                Object.assign(this.draft, settled.adopted)
                this.#saved = settled.saved
                if(!this.#leaving && this.#isSaved()) forgetDraft(this.#backupKey)      // The card may be gone by now, its effect above with it
            }
            return this.#deleted ? null : this.id ?? null
        })
        this.#queue = run
        return run
    }

    // A locked note sends its text encrypted | an unreadable one has none to send, its empty draft must not replace it
    async #sealed(sent: Partial<NoteContent>): Promise<Partial<NoteContent> & { sealed?: string }> {
        if(!this.#options.note()?.sealed || sent.body === undefined) return sent
        const { body, ...rest } = sent
        if(this.#unreadable) return rest
        return { ...rest, sealed: await sealBody(body) }
    }

    // Saved first, the lock wraps what the note shows | false when the password was not given or the server refused
    setLocked = async (locked: boolean): Promise<boolean> => {
        if(locked ? !await unlockNotes() : this.#unreadable) return false
        const noteId = await this.store()
        if(!noteId) return false

        const run = this.#queue.then(async () => {
            const body = $state.snapshot(this.draft.body)
            const result = await safeAction(kept(locked ? sealBody(body).then((sealed) => lockNote({ id: noteId, sealed })) : unlockNote({ id: noteId, body })))
            if(!result) return false
            this.#savedAt = result.updated
            forgetDraft(this.#backupKey)
            return true
        })
        this.#queue = run
        return run
    }

    // Nobody can correct a closed card, what the server refuses would stay refused
    #fitClosed(){
        const fit = fitted($state.snapshot(this.draft))
        if(fit.title === this.draft.title && fit.body === this.draft.body) return
        Object.assign(this.draft, fit)
        notify('This note was too long and got shortened.', { type: 'info' })
    }

    // Deleted elsewhere, or no longer shared with this user | the card goes, typed text lives on as a note of its own, the rest of the errors go on
    async #gone(err: { status?: number }, content: NoteContent, sent: Partial<NoteContent>): Promise<null> {
        if(err?.status !== 404) throw err
        const rest = rescued(content, sent, this.owned)
        this.#deleted = true
        if(this.id) dropNotes([this.id])

        // A copy that fails stays in the backup for the next page load
        if(rest && !await safeAction(kept(createNote(rest)))) return null
        forgetDraft(this.#backupKey)
        notify(rest ? 'This note is no longer available. Your edits became a note of their own.' : 'This note was deleted or is no longer shared with you.', { type: 'info' })
        return null
    }

    // A reminder needs a stored note, an empty new one gets created on demand
    ensureNote = async (): Promise<string | null> => {
        if(!this.id && isEmpty(this.draft)) this.draft.title = 'Reminder'
        return await this.save()
    }

    archive = async () => {
        const { archived, pinned } = this.draft
        Object.assign(this.draft, archiveChange(this.draft, !archived))
        this.#options.close()

        const noteId = await this.save()
        if(noteId) offerArchiveUndo([{ id: noteId, archived, pinned }], !archived)
    }

    // The edits land first, so an Undo brings them back too
    remove = async () => {
        const noteId = await this.save()
        this.#deleted = true
        forgetDraft(this.#backupKey)
        const me = this.#options.me()
        if(noteId) removeNotes([{ id: noteId, owner: this.#options.note()?.owner ?? me }], me)
        this.#options.close()
    }
}
