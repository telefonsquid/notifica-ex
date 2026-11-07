<script module lang="ts">
    import type MarkdownEditorComponent from '#lib/components/MarkdownEditor.svelte';

    // EDITOR | Tiptap is heavy, it loads on the first hover or opening and a skeleton stands in until then
    let MarkdownEditor = $state.raw<typeof MarkdownEditorComponent>()
    let loading: Promise<unknown> | undefined

    function loadEditor(){
        loading ??= import('#lib/components/MarkdownEditor.svelte').then((module) => MarkdownEditor = module.default)
        return loading
    }

    // For the page, which glides the open card again once the editor took the place of the skeleton
    export const editor = {
        get loaded(){ return !!MarkdownEditor },
        load: loadEditor
    }
</script>

<script lang="ts">
    import { beforeNavigate, goto } from '$app/navigation';
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import ReminderList from '#lib/components/ReminderList.svelte';
    import NoteImages from '#lib/components/NoteImages.svelte';
    import NoteTabs from '#lib/components/NoteTabs.svelte';
    import ShareEditor from '#lib/components/ShareEditor.svelte';
    import { IMAGE_TYPES, imagesIn, shrink, uploadImage } from '#lib/images.ts';
    import { longPress } from '#lib/long_press.ts';
    import { appear, rise, unfold } from '#lib/motion.ts';
    import { offerArchiveUndo, removeNotes } from '#lib/deletions.ts';
    import { afterSave, changedFields, fitted, forgetDraft, holdSave, keepDraft, rescued, thisTab } from '#lib/drafts.ts';
    import type { SharedNote } from '#lib/android.ts';
    import { keepEvents, kept } from '#lib/note_list.ts';
    import { emptyNote, isEmpty } from '#lib/notes.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { Label, Note, NoteContent, Person, Reminder } from '#lib/schemas.ts';
    import { showHistory } from '#lib/singletons/reminder_history.svelte.ts';
    import { serverStatus } from '#lib/singletons/server_status.svelte.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Archive, ArchiveRestore, Check, ImagePlus, LogOut, Pin, Trash2 } from '@lucide/svelte';
    import { untrack } from 'svelte';
    import { createNote, removeImage, shareNote, updateNote } from '../../routes/api/notes.remote';

    /*
        One note, closed as a card in the grid or open for editing. Opening keeps every element
        and only adds the controls around them, so the page can glide the card to its new size.
    */

    // PROPS
    let {
        note,
        defaults,
        incoming,
        open = false,
        closing = false,
        labels,
        reminders,
        me,
        people,
        selected = false,
        focus,
        onopen,
        onlongpress,
        ontoggle,
        ondone,
        oncreate,
        onclose
    }: {
        note: Note | null                                       // null starts a new note, which comes open
        defaults?: Partial<NoteContent>                         // what a new note begins with, like the labels its view asks for
        incoming?: SharedNote | null                            // shared from another app, saved without a keystroke
        open?: boolean
        closing?: boolean                                       // the controls fade out before the card shrinks
        labels: Label[]
        reminders: Reminder[]
        me: string                                              // the signed in user
        people: Person[]                                        // everyone with an account, for sharing and the faces on shared notes
        selected?: boolean
        focus?: string                                          // reminder to open right away, see ReminderList
        onopen?: () => void                                     // a click on the closed card, opens it or joins the selection
        onlongpress?: () => void                                // mouse only, a finger opens the context menu instead
        ontoggle?: (task: number) => void                       // ticks a checklist entry right on the card, counted in reading order
        ondone: (reminder: Reminder) => void                    // ticks off an open task reminder
        oncreate?: (id: string) => void                         // a new note got stored, the page follows it by id from then on
        onclose?: () => void
    } = $props()

    // DRAFT | edited freely while open, follows the stored note while closed
    const initial = untrack(() => note)
    let id = $state(initial?.id)
    let draft = $state<NoteContent>(initial ? contentOf(initial) : { ...emptyNote(), ...untrack(() => defaults), ...untrack(() => incoming?.content) })
    let saved = $state(untrack(() => incoming ? '' : JSON.stringify(draft)))             // Empty, a shared note has unsaved content from the start
    let savedAt = initial?.updated ?? ''
    let deleted = false
    let signedOut = false
    let root = $state<HTMLElement>()
    let card = $state<HTMLElement>()

    // Starts the breathing wash in phase with every other selected card, timed from page load
    const BREATH = 2400
    let breathOffset = $derived(selected ? `-${Math.round(performance.now() % BREATH)}ms` : undefined)

    function contentOf(note: Note): NoteContent {
        const { title, body, color, labels, pinned, archived } = note
        return { title, body, color, labels: [...labels], pinned, archived }
    }

    // Changes from elsewhere land while closed and nothing is waiting to be saved | a copy not newer than the last save has nothing new
    $effect.pre(() => {
        if(open || !note || note.updated <= savedAt) return
        if(untrack(() => JSON.stringify(draft)) !== saved) return

        draft = contentOf(note)
        saved = JSON.stringify(draft)
        savedAt = note.updated
    })

    // SAVING | one save at a time, a new note gets created exactly once
    let queue: Promise<unknown> = Promise.resolve()

    // Drafts only change on an open card, so the rest of the grid stays out of all this
    let edited = false

    $effect.pre(() => {
        if(open) edited = true
    })

    // Forced, an empty new note gets created anyway, images need a stored note to hang on
    function save(force = false): Promise<string | null> {
        if(!edited && !force) return Promise.resolve(id ?? null)

        const run = queue.then(async () => {
            if(deleted || signedOut) return null
            if(!open) fitClosed()

            const snapshot = JSON.stringify(draft)
            if(snapshot === saved && (id || !force)) return id ?? null
            if(!id && isEmpty(draft) && !force) return null

            const content = $state.snapshot(draft)
            const base: NoteContent = id ? JSON.parse(saved) : content
            const sent = id ? changedFields(base, content) : content
            const result = await safeAction(id ? kept(updateNote({ id, ...sent })).catch((err) => gone(err, content, sent)) : kept(createNote(content)))
            if(result){
                if(!id) oncreate?.(result.id)
                id = result.id
                savedAt = result.updated

                const settled = afterSave(base, sent, $state.snapshot(draft), result)
                Object.assign(draft, settled.adopted)
                saved = JSON.stringify(settled.saved)
                if(!leaving && JSON.stringify(draft) === saved) forgetDraft(backupKey)      // The card may be gone by now, its effect below with it
            }
            return deleted ? null : id ?? null
        })
        queue = run
        return run
    }

    // Nobody can correct a closed card, what the server refuses would stay refused
    function fitClosed(){
        const fit = fitted($state.snapshot(draft))
        if(fit.title === draft.title && fit.body === draft.body) return
        Object.assign(draft, fit)
        notify('This note was too long and got shortened.', { type: 'info' })
    }

    // Deleted elsewhere, or no longer shared with this user | the card goes, typed text lives on as a note of its own, the rest of the errors go on
    async function gone(err: { status?: number }, content: NoteContent, sent: Partial<NoteContent>): Promise<null> {
        if(err?.status !== 404) throw err
        const rest = rescued(content, sent, owned)
        deleted = true
        if(note) keepEvents([{ action: 'delete', record: note }])

        // A copy that fails stays in the backup for the next page load
        if(rest && !await safeAction(kept(createNote(rest)))) return null
        forgetDraft(backupKey)
        notify(rest ? 'This note is no longer available. Your edits became a note of their own.' : 'This note was deleted or is no longer shared with you.', { type: 'info' })
        return null
    }

    // BACKUP | whatever isn't stored yet also waits in this browser, see #lib/drafts.ts
    const backupKey = `${initial?.id ?? `new-${Math.random().toString(36).slice(2)}`}.${thisTab}`     // Per tab, a save in one must not drop what another still holds

    // The next page may read its list before the last save lands, so the backup stays for it to compare
    let leaving = false

    $effect(() => {
        if(!open && !edited) return
        const snapshot = JSON.stringify(draft)
        if(deleted || snapshot === saved || (!id && isEmpty(draft))){
            if(!leaving) forgetDraft(backupKey)
        }
        else keepDraft(backupKey, { owner: me, id, base: saved ? JSON.parse(saved) : undefined, content: JSON.parse(snapshot) })
    })

    // Logout saves first
    $effect(() => {
        if(open) return holdSave(save)
    })

    // For the page, which waits on a new note before it hands the card over
    export function flush(): Promise<string | null> {
        return save()
    }

    // Autosave a moment after typing stops, right away once the note closes or goes
    $effect(() => {
        if(!open) return
        JSON.stringify(draft)
        const timer = setTimeout(save, 900)
        return () => clearTimeout(timer)
    })

    $effect(() => {
        if(!open) untrack(save)
    })

    $effect(() => () => { save() })

    // A save lost to an outage goes out again once the server is back
    $effect(() => {
        if(!serverStatus.down) untrack(save)
    })

    // A reminder needs a stored note, an empty new one gets created on demand
    async function ensureNote(): Promise<string | null> {
        if(!id && isEmpty(draft)) draft.title = 'Reminder'
        return await save()
    }

    $effect(() => {
        if(open) loadEditor()
    })

    // IMAGES AND PEOPLE | stored apart from the draft, uploads show as local previews until they're through
    let images = $state(initial?.images ?? [])
    let shared = $state(initial?.shared ?? [])
    let extrasAt = initial?.updated ?? ''
    let uploads = $state<{ key: string, url: string }[]>([])
    let picker = $state<HTMLInputElement>()

    // A copy older than the last change made here is stale
    $effect.pre(() => {
        if(!note || note.updated < extrasAt) return
        if(!uploads.length) images = note.images ?? []
        shared = note.shared ?? []
    })

    function stored(result: Note){
        images = result.images
        shared = result.shared
        extrasAt = result.updated
    }

    async function addImages(files: File[]){
        const room = LIMITS.NOTE_IMAGES - images.length - uploads.length
        if(files.length > room) notify(`A note holds at most ${LIMITS.NOTE_IMAGES} images.`, { type: 'error' })
        files = files.slice(0, Math.max(room, 0))
        if(!files.length) return

        const queued = files.map((file) => ({ key: crypto.randomUUID(), url: URL.createObjectURL(file) }))
        uploads = [...uploads, ...queued]

        const noteId = await save(true)
        for(const [index, file] of files.entries()){
            const result = noteId && await safeAction(shrink(file).then((small) => uploadImage(noteId, small)))
            if(result) stored(result)
            URL.revokeObjectURL(queued[index].url)
            uploads = uploads.filter((upload) => upload.key !== queued[index].key)
        }
    }

    $effect(() => {
        untrack(() => { if(incoming?.files.length) addImages(incoming.files) })
    })

    async function dropImage(name: string){
        if(!id) return
        images = images.filter((image) => image !== name)
        const result = await safeAction(kept(removeImage({ id, name })))
        if(result) stored(result)
    }

    // SHARING | the owner picks who else sees the note, the others see whose it is
    let owned = $derived(!note || note.owner === me)
    let names = $derived(new Map(people.map((person) => [person.id, person.name])))
    let others = $derived((owned ? shared : [note!.owner, ...shared.filter((person) => person !== me)]).map((person) => ({ id: person, name: names.get(person) ?? 'Someone' })))
    let othersTip = $derived(owned ? `Shared with ${others.map((person) => person.name).join(', ')}` : `From ${others[0]?.name}`)

    async function share(list: string[]){
        shared = list
        const noteId = await save(true)
        const result = noteId && await safeAction(kept(shareNote({ id: noteId, people: list })))
        if(result) stored(result)
    }

    // Pasted or dropped onto the open note | caught before the editor, which would ignore them or paste a file name
    function catchImages(event: Event, list?: FileList | null){
        const files = imagesIn(list)
        if(!open || !files.length) return
        event.preventDefault()
        event.stopPropagation()
        addImages(files)
    }

    function dragOver(event: DragEvent){
        if(open && event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }

    // A page still here after this long stayed, a download link for example
    const LEAVE_GRACE = 10_000

    // NAVIGATION | waits for unsaved changes, then goes where it was headed | back only closes the card, the root layout asks for that
    beforeNavigate(({ cancel, to, type, willUnload }) => {

        // The session ended, a save has no way in anymore | what is left waits in the backup
        if(to?.route.id === '/login'){
            signedOut = true
            return
        }

        if(!open || type === 'popstate' || JSON.stringify(draft) === saved) return

        // Closing or reloading goes through | a new note waits for the backup, sent now it could land twice
        if(type === 'leave') {
            leaving = true
            setTimeout(() => leaving = false, LEAVE_GRACE)
            if(id) save()
            return
        }

        cancel()
        save().then(() => {
            if(JSON.stringify(draft) !== saved || !to) return
            if(willUnload) location.href = to.url.href
            // eslint-disable-next-line svelte/no-navigation-without-resolve -- the router resolved it already
            else goto(to.url)
        })
    })

    // ACTIONS
    async function archive(){
        const { archived, pinned } = draft
        draft.archived = !archived
        if(draft.archived) draft.pinned = false     // pinned only matters among active notes
        onclose?.()

        const noteId = await save()
        if(noteId) offerArchiveUndo([{ id: noteId, archived, pinned }], !archived)
    }

    // The edits land first, so an Undo brings them back too
    async function remove(){
        const noteId = await save()
        deleted = true
        forgetDraft(backupKey)
        if(noteId) removeNotes([{ id: noteId, owner: note?.owner ?? me }], me)
        onclose?.()
    }

    // CLOSE | a press anywhere else or Escape folds the card back, its tabs and the popovers opened from it count as inside
    const FLOATING = '[data-bits-floating-content-wrapper], [data-popover-content], [data-dialog-content]'

    // A touch only closes once it lifts, a drag turns into a scroll and cancels it
    let touchOutside = false

    function pressOutside(event: PointerEvent){
        const target = event.target as Element
        if(!open || root?.contains(target) || target.closest(FLOATING)) return
        if(event.pointerType === 'mouse') onclose?.()
        else touchOutside = true
    }

    function liftOutside(){
        if(touchOutside && open) onclose?.()
        touchOutside = false
    }

    // The editor claims every Escape for itself, so only others that handled it keep the card open
    function escape(event: KeyboardEvent){
        const handled = event.defaultPrevented && !(event.target as Element).closest('.ProseMirror')
        if(!open || event.key !== 'Escape' || handled || document.querySelector(`${FLOATING}[data-state='open']`)) return
        event.preventDefault()
        onclose?.()
    }

    // TITLE | the same heading on the card and in the open note, the browser owns its text while it has focus
    const initialTitle = untrack(() => draft.title)

    function titleField(node: HTMLElement){
        node.contentEditable = open ? 'plaintext-only' : 'false'
        if(document.activeElement !== node && node.textContent !== draft.title) node.textContent = draft.title
    }

    function typeTitle(event: Event & { currentTarget: HTMLElement }){
        draft.title = (event.currentTarget.textContent ?? '').replace(/\n/g, ' ')
    }

    // Enter moves on to the text, a title stays one line
    function titleKey(event: KeyboardEvent){
        if(event.key !== 'Enter') return
        event.preventDefault()
        card?.querySelector<HTMLElement>('.ProseMirror, textarea')?.focus()
    }

    // CARD CLICKS | only the checkboxes sit above the cover button
    function toggleTask(event: MouseEvent){
        const box = event.target
        if(open || !(box instanceof HTMLInputElement) || !box.classList.contains('task')) return
        const tasks = [...(event.currentTarget as HTMLElement).querySelectorAll('input.task')]
        ontoggle?.(tasks.indexOf(box))
    }
</script>

<svelte:window onpointerdown={pressOutside} onpointerup={liftOutside} onpointercancel={() => touchOutside = false} onkeydown={escape} />

{#snippet actions()}
    <button class="icon-button" aria-label="Add images" onclick={() => picker?.click()} {@attach tip('Add images')}>
        <ImagePlus class="size-4" />
    </button>
    {#if owned}
        <ShareEditor people={people.filter((person) => person.id !== me)} {shared} onchange={share} />
    {/if}
    <ColorPicker value={draft.color} onpick={(color) => draft.color = color} label="Note color" class="ml-1 mr-2" />
    {#if owned}
        <button class="icon-button" aria-label={draft.archived ? 'Unarchive' : 'Archive'} onclick={archive} {@attach tip(draft.archived ? 'Back to the notes' : 'Archive')}>
            {#if draft.archived}<ArchiveRestore class="size-4" />{:else}<Archive class="size-4" />{/if}
        </button>
    {/if}
    <!-- Someone else's note can only be left, it stays with its owner -->
    <button class="icon-button" aria-label={owned ? 'Delete' : 'Leave'} onclick={remove} {@attach tip(owned ? 'Delete note' : 'Leave this note')}>
        {#if owned}<Trash2 class="size-4" />{:else}<LogOut class="size-4" />{/if}
    </button>
{/snippet}

<!-- The tabs sit beside the colored card, not on it, so they keep the page ink -->
<div bind:this={root} class={['note relative', open && 'open', (closing || !open) && 'folded']} data-flip-body>

    {#if selected}
        <span class="badge pointer-events-none absolute -top-2 -right-2 z-10 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow-md" in:rise={{ y: 0, scale: 0.6, duration: 'fast' }}>
            <Check class="size-3.5" strokeWidth={3} />
        </span>
    {/if}

    <NoteTabs bind:picked={draft.labels} {labels} {open} {owned} />

    <article
        bind:this={card}
        style:--breath-offset={breathOffset}
        class={['card note-surface relative flex flex-col gap-3 rounded-card border p-card text-ink', open ? 'border-line-strong shadow-2xl' : 'border-line hover:border-line-strong', selected && 'selected']}
        data-note={draft.color || undefined}
        aria-label={open ? (id ? 'Edit note' : 'New note') : undefined}
        {@attach longPress(() => !open, () => onlongpress?.())}
        onpastecapture={(event) => catchImages(event, event.clipboardData?.files)}
        ondragovercapture={dragOver}
        ondropcapture={(event) => catchImages(event, event.dataTransfer?.files)}
    >
        {#if !open}
            <button class="cover absolute inset-0 rounded-card" aria-label={`Open ${draft.title || 'note'}`} aria-pressed={selected || undefined} onpointerenter={loadEditor} onfocus={loadEditor} onclick={onopen}></button>
        {/if}

        <!-- IMAGES | on top, edge to edge, the picker sits hidden for the button among the actions -->
        <NoteImages note={id} {images} {uploads} editable={open} alone={!open && !draft.title && !draft.body && !draft.pinned && !reminders.length} onremove={dropImage} />
        <input bind:this={picker} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onchange={(event) => {
            addImages(imagesIn(event.currentTarget.files))
            event.currentTarget.value = ''
        }} />

        <!-- TITLE | colour, archive and delete join the pin up here once the note is wide enough -->
        {#if open || draft.title || draft.pinned || others.length}
            <header class={['flex items-start gap-2', !open && 'pointer-events-none']} in:appear out:unfold>
                <h3
                    class={['title type-title min-w-0 flex-1 text-lg leading-snug break-words outline-none', !draft.title && 'blank']}
                    role={open ? 'textbox' : undefined}
                    aria-label={open ? 'Title' : undefined}
                    data-placeholder="Title"
                    oninput={typeTitle}
                    onkeydown={titleKey}
                    {@attach titleField}
                >{initialTitle}</h3>
                <!-- One row with the pin, so every button keeps the same distance -->
                <div class="-my-1 -mr-2 flex items-center gap-0.5">
                    {#if others.length}
                        <!-- The others on a shared note, the owner first when it's someone else's -->
                        <span class="pointer-events-auto relative z-10 mr-1 flex -space-x-1.5" role="img" aria-label={othersTip} {@attach tip(othersTip)}>
                            {#each others.slice(0, 3) as person (person.id)}
                                <span class="face type-meta grid size-6 place-items-center rounded-full bg-secondary-soft text-ink">{person.name.slice(0, 1).toUpperCase()}</span>
                            {/each}
                            {#if others.length > 3}
                                <span class="face type-meta grid size-6 place-items-center rounded-full bg-line text-ink-muted">+{others.length - 3}</span>
                            {/if}
                        </span>
                    {/if}
                    {#if open}
                        <div class="extra hidden items-center gap-0.5 @min-[26rem]/note:flex" in:appear out:unfold={{ axis: 'x' }}>{@render actions()}</div>
                    {/if}
                    {#if (open && owned) || draft.pinned}
                        <button
                            class={['icon-button', draft.pinned ? 'text-accent hover:text-accent' : 'extra']}
                            tabindex={open ? 0 : -1}
                            disabled={!owned}
                            aria-label={draft.pinned ? 'Unpin' : 'Pin'}
                            aria-pressed={draft.pinned}
                            onclick={() => draft.pinned = !draft.pinned}
                            in:appear
                            out:unfold={{ axis: 'x' }}
                            {@attach tip(draft.pinned ? 'Unpin' : 'Pin to the top')}
                        >
                            <Pin class="size-4" fill={draft.pinned ? 'currentColor' : 'none'} />
                        </button>
                    {/if}
                </div>
            </header>
        {/if}

        <!-- CONTENT | the rendered text holds its place until the editor is there -->
        {#if open || draft.body}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class={['content flex flex-col gap-2', !open && 'pointer-events-none']} onclick={toggleTask} in:appear out:unfold>
                {#if open && MarkdownEditor}
                    <MarkdownEditor bind:value={draft.body} autofocus={!draft.title && !focus} />
                {:else}
                    <Markdown source={draft.body} class={['text-ink-muted', open ? 'min-h-32' : 'line-clamp-[12]']} />
                    {#if open}
                        <div class="extra flex min-h-8 items-center gap-1.5" aria-hidden="true" in:appear out:unfold>
                            {#each { length: 7 }, index (index)}<span class="skeleton size-5 rounded-md"></span>{/each}
                            <span class="skeleton ml-auto size-5 rounded-md"></span>
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}

        <!-- ACTIONS | their own row below the text while the note is narrow -->
        {#if open}
            <div class="extra -mx-2 -mt-2 flex items-center gap-0.5 @min-[26rem]/note:hidden" in:appear out:unfold>{@render actions()}</div>
        {/if}

        <!-- REMINDERS -->
        <ReminderList {reminders} {ensureNote} focus={open ? focus : undefined} editable={open} {ondone} onhistory={(anchor) => note && showHistory({ id: note.id, title: draft.title, color: draft.color }, anchor)} />
    </article>
</div>

<style>
    .card {
        transition:
            border-color var(--duration-fast) var(--ease-out),
            box-shadow var(--duration-slow) var(--ease-emphasized),
            scale var(--duration-fast) var(--ease-out);
    }

    .card:has(> .cover:active) {
        scale: 0.985;
    }

    /* SELECTED | a faint accent wash over the whole card */
    .card::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--theme-signature);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--duration-base) var(--ease-out);
    }

    /* Breathes through its colour so the opacity fade in stays untouched */
    .card.selected::after {
        opacity: 0.18;
        animation: breathe 2.4s var(--ease-in-out) var(--breath-offset, 0s) infinite;
    }

    @keyframes breathe {
        50% { background: color-mix(in oklab, var(--theme-signature) 45%, transparent); }
    }

    @media (prefers-reduced-motion: reduce) {
        .card.selected::after { animation: none; }
    }

    /* RESIZING | the card fills the box that glides to its new size, see glide() in #lib/motion.ts */
    .note:global([data-resizing]) .card {
        height: 100%;
        overflow: clip;
    }

    /* Raised above the cover button, which comes first */
    .content :global(input.task) {
        pointer-events: auto;
        position: relative;
    }

    .title.blank::before {
        content: attr(data-placeholder);
        color: var(--theme-ink-faint);
        pointer-events: none;
        /* Takes no room so the caret stays at the left */
        float: left;
        height: 0;
    }

    .note:not(.open) .title.blank::before {
        content: none;
    }

    /* FOLDED | the open only controls fade first and stay faded while they fold away with the card shrinking */
    .extra,
    .note :global(.editor-toolbar),
    .note :global(.reminder-form),
    .note :global(.band.empty) {
        transition: opacity var(--duration-fast) var(--ease-in);
    }

    /* Keeps the hover colours of the button it sits on */
    .note :global(.add-reminder) {
        transition:
            opacity var(--duration-fast) var(--ease-in),
            color var(--duration-fast) var(--ease-out),
            background-color var(--duration-fast) var(--ease-out);
    }

    .folded .extra,
    .folded :global(.editor-toolbar),
    .folded :global(.add-reminder),
    .folded :global(.reminder-form),
    .folded :global(.band.empty) {
        opacity: 0;
    }

    .skeleton {
        background: var(--theme-line);
        animation: shimmer 1.2s var(--ease-in-out) infinite alternate;
    }

    @keyframes shimmer {
        to { opacity: 0.4; }
    }

    /* A ring in the card's own colour keeps overlapping faces apart */
    .face {
        box-shadow: 0 0 0 2px var(--note-bg, var(--theme-card));
    }
</style>
