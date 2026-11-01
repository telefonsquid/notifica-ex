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
    import LabelAdder from '#lib/components/LabelAdder.svelte';
    import LabelEditor from '#lib/components/LabelEditor.svelte';
    import ReminderList from '#lib/components/ReminderList.svelte';
    import NoteImages from '#lib/components/NoteImages.svelte';
    import ShareEditor from '#lib/components/ShareEditor.svelte';
    import { IMAGE_TYPES, imagesIn, shrink, uploadImage } from '#lib/images.ts';
    import { rise, unfold } from '#lib/motion.ts';
    import { emptyNote, isEmpty } from '#lib/notes.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { Label, Note, NoteContent, Person, Reminder } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Archive, ArchiveRestore, Check, ImagePlus, LogOut, Pin, Trash2, X } from '@lucide/svelte';
    import { untrack } from 'svelte';
    import { createNote, deleteNote, leaveNote, removeImage, shareNote, updateNote } from '../../routes/api/notes.remote';

    /*
        One note, closed as a card in the grid or open for editing. Opening keeps every element
        and only adds the controls around them, so the page can glide the card to its new size.
    */

    // PROPS
    let {
        note,
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
    let draft = $state<NoteContent>(initial ? contentOf(initial) : emptyNote())
    let saved = $state(untrack(() => JSON.stringify(draft)))
    let savedAt = initial?.updated ?? ''
    let confirmDelete = $state(false)
    let deleted = false
    let root = $state<HTMLElement>()
    let card = $state<HTMLElement>()

    let labelsById = $derived(new Map(labels.map((label) => [label.id, label])))
    let tabs = $derived(draft.labels.map((labelId) => labelsById.get(labelId)).filter((label) => !!label))

    function contentOf(note: Note): NoteContent {
        const { title, body, color, labels, pinned, archived } = note
        return { title, body, color, labels: [...labels], pinned, archived }
    }

    // Changes from elsewhere land while closed and nothing is waiting to be saved | a copy older than the last save is stale
    $effect.pre(() => {
        if(open || !note || note.updated < savedAt) return
        if(untrack(() => JSON.stringify(draft)) !== saved) return

        const content = contentOf(note)
        const snapshot = JSON.stringify(content)
        if(snapshot === saved) return
        draft = content
        saved = snapshot
    })

    // SAVING | one save at a time, a new note gets created exactly once
    let queue: Promise<unknown> = Promise.resolve()

    // Forced, an empty new note gets created anyway, images need a stored note to hang on
    function save(force = false): Promise<string | null> {
        const run = queue.then(async () => {
            const snapshot = JSON.stringify(draft)
            if(deleted || (snapshot === saved && (id || !force))) return id ?? null
            if(!id && isEmpty(draft) && !force) return null

            const content = $state.snapshot(draft)
            const result = await safeAction(id ? updateNote({ id, ...content }) : createNote(content))
            if(result){
                if(!id) oncreate?.(result.id)
                id = result.id
                savedAt = result.updated
                saved = snapshot
            }
            return id ?? null
        })
        queue = run
        return run
    }

    // For the page, which waits on a new note before it hands the card over
    export function flush(): Promise<string | null> {
        return save()
    }

    // Autosave a moment after typing stops, right away once the note closes or goes
    $effect(() => {
        JSON.stringify(draft)
        const timer = setTimeout(save, 900)
        return () => clearTimeout(timer)
    })

    $effect(() => {
        if(!open) untrack(save)
    })

    $effect(() => () => { save() })

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

    async function dropImage(name: string){
        if(!id) return
        images = images.filter((image) => image !== name)
        const result = await safeAction(removeImage({ id, name }))
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
        const result = noteId && await safeAction(shareNote({ id: noteId, people: list }))
        if(result) stored(result)
    }

    // Pasted or dropped onto the open note | caught before the editor, which would ignore them or paste a file name
    function pasteImages(event: ClipboardEvent){
        const files = imagesIn(event.clipboardData?.files)
        if(!open || !files.length) return
        event.preventDefault()
        event.stopPropagation()
        addImages(files)
    }

    function dropImages(event: DragEvent){
        const files = imagesIn(event.dataTransfer?.files)
        if(!open || !files.length) return
        event.preventDefault()
        event.stopPropagation()
        addImages(files)
    }

    function dragOver(event: DragEvent){
        if(open && event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }

    // NAVIGATION | waits for unsaved changes, then goes where it was headed
    beforeNavigate((navigation) => {
        const { cancel, to, type, willUnload } = navigation
        if(!open || JSON.stringify(draft) === saved) return
        cancel()
        if(type === 'leave') {
            save()
            return
        }

        save().then(() => {
            if(JSON.stringify(draft) !== saved || !to) return
            if(navigation.type === 'popstate') history.go(navigation.delta)
            else if(willUnload) location.href = to.url.href
            // eslint-disable-next-line svelte/no-navigation-without-resolve -- the router resolved it already
            else goto(to.url)
        })
    })

    // ACTIONS
    function archive(){
        draft.archived = !draft.archived
        if(draft.archived) draft.pinned = false     // pinned only matters among active notes
        onclose?.()
    }

    async function remove(){
        if(!confirmDelete){
            confirmDelete = true
            return
        }
        await queue
        if(id && !await safeAction(owned ? deleteNote(id) : leaveNote(id))) return
        deleted = true
        onclose?.()
    }

    // CLOSE | a press anywhere else or Escape folds the card back, its tabs and the popovers opened from it count as inside
    const FLOATING = '[data-bits-floating-content-wrapper], [data-popover-content]'

    function pressOutside(event: PointerEvent){
        const target = event.target as Element
        if(!open || root?.contains(target) || target.closest(FLOATING)) return
        onclose?.()
    }

    // The editor claims every Escape for itself, so only others that handled it keep the card open
    function escape(event: KeyboardEvent){
        const handled = event.defaultPrevented && !(event.target as Element).closest('.ProseMirror')
        if(!open || event.key !== 'Escape' || handled || document.querySelector(`${FLOATING}[data-state='open']`)) return
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

    // LONG PRESS | held still for a moment, the click that follows the release gets swallowed
    const HOLD = 500
    let timer: ReturnType<typeof setTimeout> | undefined
    let start = { x: 0, y: 0 }
    let held = false

    function press(event: PointerEvent){
        if(open || event.pointerType !== 'mouse' || event.button !== 0) return
        start = { x: event.clientX, y: event.clientY }
        held = false
        timer = setTimeout(() => {
            held = true
            onlongpress?.()
        }, HOLD)
    }

    function drift(event: PointerEvent){
        if(timer && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) release()
    }

    function release(){
        clearTimeout(timer)
        timer = undefined
    }

    function swallow(event: MouseEvent){
        if(!held) return
        held = false
        event.stopPropagation()
        event.preventDefault()
    }

    // Controls that only the open note has drift in once the card made room for them
    function appear(node: Element){
        return rise(node, { y: 4, scale: 1, blur: 2, duration: 'base', delay: 120 })
    }
</script>

<svelte:window onpointerdown={pressOutside} onkeydown={escape} />

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
    <button
        class={['icon-button', confirmDelete && 'bg-accent text-on-accent hover:text-on-accent']}
        aria-label={confirmDelete ? `Confirm ${owned ? 'delete' : 'leave'}` : owned ? 'Delete' : 'Leave'}
        onclick={remove}
        onblur={() => confirmDelete = false}
        {@attach tip(confirmDelete ? `Click again to ${owned ? 'delete' : 'leave'}` : owned ? 'Delete note' : 'Leave this note')}
    >
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

    <!-- LABELS | folder tabs on the top or bottom edge, named on hover and while open, the add tab keeps to the far end -->
    {#if tabs.length || (open && owned)}
        <ul class="tabs absolute flex gap-1" aria-label="Labels">
            {#each tabs as label (label.id)}
                <li class="tab note-mark type-meta flex min-w-6 items-center gap-0.5 px-2.5" data-note={label.color || undefined}>
                    {#if open}
                        <LabelEditor {label} ondelete={() => draft.labels = draft.labels.filter((item) => item !== label.id)} />
                    {:else}
                        <span class="name truncate">{label.name}</span>
                    {/if}
                    {#if open}
                        <button class="remove extra -mr-2 grid shrink-0 place-items-center rounded-full p-0.5" aria-label={`Remove ${label.name}`} onclick={() => draft.labels = draft.labels.filter((item) => item !== label.id)} in:appear out:unfold={{ axis: 'x' }}>
                            <X class="size-3" />
                        </button>
                    {/if}
                </li>
            {/each}
            {#if open && owned}
                <li class="adder-tab extra ml-auto shrink-0" in:appear out:unfold={{ axis: 'x' }}>
                    <LabelAdder class="h-full" {labels} taken={draft.labels} onadd={(labelId) => draft.labels = [...draft.labels, labelId]} />
                </li>
            {/if}
        </ul>
    {/if}

    <article
        bind:this={card}
        class={['card note-surface relative flex flex-col gap-3 rounded-card border p-card text-ink', open ? 'border-line-strong shadow-2xl' : 'border-line hover:border-line-strong', selected && 'selected']}
        data-note={draft.color || undefined}
        aria-label={open ? (id ? 'Edit note' : 'New note') : undefined}
        onpointerdown={press}
        onpointermove={drift}
        onpointerup={release}
        onpointerleave={release}
        onclickcapture={swallow}
        onpastecapture={pasteImages}
        ondragovercapture={dragOver}
        ondropcapture={dropImages}
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
        <ReminderList {reminders} {ensureNote} focus={open ? focus : undefined} editable={open} {ondone} />
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

    .card.selected::after { opacity: 0.18; }

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

    /* TABS | inset by the corner radius so they sit on the straight part of the edge */
    .tabs {
        bottom: 100%;
        left: var(--layout-radius-card);
        max-width: calc(100% - 2 * var(--layout-radius-card));
        align-items: end;
        overflow: hidden;
        pointer-events: none;
    }

    .open .tabs {
        right: var(--layout-radius-card);
        pointer-events: auto;
    }

    .tab {
        height: 0.3125rem;
        border-radius: 0.375rem 0.375rem 0 0;
        transition: height var(--duration-base) var(--ease-spring);
    }

    .adder-tab {
        height: 1.375rem;
    }

    /* Bottom edge as picked in the settings, the tabs then grow downwards */
    :global([data-labels='bottom']) .tabs {
        top: 100%;
        bottom: auto;
        align-items: start;
    }

    :global([data-labels='bottom']) .tab {
        border-radius: 0 0 0.375rem 0.375rem;
    }

    .name {
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-out);
    }

    .note:hover .tab,
    .note:focus-within .tab {
        height: 1.25rem;
    }

    .open .tab,
    .open:hover .tab {
        height: 1.375rem;
    }

    .note:hover .name,
    .note:focus-within .name,
    .open .name {
        opacity: 1;
        transition-delay: calc(var(--duration-fast) * 0.5);
    }

    /* A ring in the card's own colour keeps overlapping faces apart */
    .face {
        box-shadow: 0 0 0 2px var(--note-bg, var(--theme-card));
    }

    .remove {
        opacity: 0.6;
        transition: opacity var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .remove:hover {
        opacity: 1;
        background: color-mix(in oklab, currentColor 15%, transparent);
    }

    .folded .remove {
        opacity: 0;
    }
</style>
