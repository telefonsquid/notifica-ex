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
    import ShareEditor from '#lib/components/ShareEditor.svelte';
    import { imagesIn, imageUrl, uploadImages } from '#lib/images.ts';
    import { rise, unfold } from '#lib/motion.ts';
    import { emptyNote, isEmpty } from '#lib/notes.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { IMAGE_TYPES, type Label, type Note, type NoteContent, type Person, type Reminder } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import ConfirmButton from '#lib/ui/ConfirmButton.svelte';
    import Initials from '#lib/ui/Initials.svelte';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Archive, ArchiveRestore, Check, ImagePlus, LogOut, Pin, Trash2, X } from '@lucide/svelte';
    import { untrack } from 'svelte';
    import { createNote, deleteNote, getNotes, removeNoteImage, updateNote } from '../../routes/api/notes.remote';

    /*
        One note, closed as a card in the grid or open for editing. Opening keeps every element
        and only adds the controls around them, so the page can glide the card to its new size.
    */

    // PROPS
    let {
        note,
        me,
        people,
        open = false,
        closing = false,
        labels,
        reminders,
        selected = false,
        focus,
        onopen,
        onlongpress,
        ontoggle,
        ondone,
        oncreate,
        onclose
    }: {
        note: Note | null                                       // null starts a new note, which comes open | a new one gets its record once stored
        me: string                                              // the user looking at it
        people: Map<string, Person>                             // everyone it may be shared with or by
        open?: boolean
        closing?: boolean                                       // the controls fade out before the card shrinks
        labels: Label[]
        reminders: Reminder[]
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
    let deleted = false
    let root = $state<HTMLElement>()
    let card = $state<HTMLElement>()

    // SHARING | the stored record decides, a new note is the user's own
    let owner = $derived(note?.owner ?? me)
    let sharedWith = $derived(note?.sharedWith ?? [])
    let mine = $derived(owner === me)
    let others = $derived([owner, ...sharedWith].filter((person) => person !== me))

    function nameOf(person: string): string {
        return people.get(person)?.name || people.get(person)?.email || 'Someone'
    }

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

    // Forced, an empty new note gets stored too, an image needs a note to go on
    function save(force = false): Promise<string | null> {
        const run = queue.then(async () => {
            const snapshot = JSON.stringify(draft)
            if(deleted || (id && snapshot === saved)) return id ?? null
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

    // IMAGES | stored with the note record, they arrive through it like any other change
    let images = $derived(note?.images ?? [])
    let uploading = $state(0)

    async function addImages(files: File[]){
        if(!files.length) return
        uploading += files.length
        const noteId = await save(true)
        if(noteId && await uploadImages(noteId, files)) await getNotes().refresh()
        uploading -= files.length
    }

    function removeImage(file: string){
        if(note) safeAction(removeNoteImage({ id: note.id, file }))
    }

    // Pasted or dropped onto the open note | text keeps going to the editor
    function pasteImages(event: ClipboardEvent){
        const files = imagesIn(event.clipboardData?.files)
        if(!open || !files.length) return
        event.preventDefault()
        addImages(files)
    }

    function dropImages(event: DragEvent){
        const files = imagesIn(event.dataTransfer?.files)
        if(!open || !files.length) return
        event.preventDefault()
        addImages(files)
    }

    function allowDrop(event: DragEvent){
        if(open && event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }

    $effect(() => {
        if(open) loadEditor()
    })

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
    // Archiving closes the note and offers to take it back, the pin included
    async function archive(){
        const pinned = draft.pinned
        draft.archived = !draft.archived
        if(draft.archived) draft.pinned = false     // pinned only matters among active notes
        onclose?.()
        if(!draft.archived) return

        const noteId = await save()
        if(noteId) notify('Note archived.', { type: 'info', action: { label: 'Undo', run: () => safeAction(updateNote({ id: noteId, archived: false, pinned })) } })
    }

    async function remove(){
        await queue
        if(id && !await safeAction(deleteNote(id))) return
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
    <ColorPicker value={draft.color} onpick={(color) => draft.color = color} label="Note color" class="ml-1 mr-2" />
    <button class="icon-button" aria-label={draft.archived ? 'Unarchive' : 'Archive'} onclick={archive} {@attach tip(draft.archived ? 'Back to the notes' : 'Archive')}>
        {#if draft.archived}<ArchiveRestore class="size-4" />{:else}<Archive class="size-4" />{/if}
    </button>
    <label class="icon-button cursor-pointer" {@attach tip('Add images')}>
        <ImagePlus class="size-4" />
        <input type="file" accept={IMAGE_TYPES.join(',')} multiple class="sr-only" aria-label="Add images" onchange={(event) => { addImages(imagesIn(event.currentTarget.files)); event.currentTarget.value = '' }} />
    </label>
    <ShareEditor {owner} {sharedWith} {me} {people} ensureNote={save} onleave={() => { deleted = true; onclose?.() }} />
    {#if mine}
        <ConfirmButton icon={Trash2} label="Delete" confirmLabel="Confirm delete" hint={sharedWith.length ? 'Delete note for everyone' : 'Delete note'} confirmHint="Click again to delete" onconfirm={remove} />
    {:else}
        <ConfirmButton icon={LogOut} label="Leave" confirmLabel="Confirm leaving" hint="Leave, the owner keeps it" confirmHint="Click again to leave" onconfirm={remove} />
    {/if}
{/snippet}

<!-- The tabs sit beside the colored card, not on it, so they keep the page ink -->
<div bind:this={root} class={['note relative', open && 'open', (closing || !open) && 'folded']} data-flip-body>

    {#if selected}
        <span class="badge pointer-events-none absolute -top-2 -right-2 z-10 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow-md" in:rise={{ y: 0, scale: 0.6, duration: 'fast' }}>
            <Check class="size-3.5" strokeWidth={3} />
        </span>
    {/if}

    <!-- LABELS | folder tabs on the top or bottom edge, named on hover and while open, the add tab keeps to the far end -->
    {#if tabs.length || open}
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
            {#if open}
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
        onpaste={pasteImages}
        ondrop={dropImages}
        ondragover={allowDrop}
    >
        {#if !open}
            <button class="cover absolute inset-0 rounded-card" aria-label={`Open ${draft.title || 'note'}`} aria-pressed={selected || undefined} onpointerenter={loadEditor} onfocus={loadEditor} onclick={onopen}></button>
        {/if}

        <!-- IMAGES | edge to edge across the top, an odd one out spans the whole width -->
        {#if images.length || uploading}
            {@const count = images.length + uploading}
            <div class={['images -mx-card -mt-card grid gap-0.5 overflow-hidden', count > 1 && 'grid-cols-2']} in:appear out:unfold>
                {#each images as file, index (file)}
                    <figure class={['relative min-h-0', index === 0 && count % 2 === 1 && count > 1 && 'col-span-2']}>
                        <img
                            src={imageUrl(note!.id, file, 'card')}
                            srcset={`${imageUrl(note!.id, file, 'card')} 640w, ${imageUrl(note!.id, file, 'open')} 1280w`}
                            sizes={open ? '40rem' : '20rem'}
                            alt=""
                            loading="lazy"
                            class={['size-full object-cover', count > 1 ? 'aspect-square' : 'max-h-96']}
                        />
                        {#if open}
                            <button class="remove-image extra absolute top-2 right-2 grid place-items-center rounded-full p-1.5" aria-label="Remove image" onclick={() => removeImage(file)} {@attach tip('Remove image')}>
                                <X class="size-3.5" />
                            </button>
                        {/if}
                    </figure>
                {/each}
                {#each { length: uploading }, index (index)}
                    <span class="skeleton aspect-square"></span>
                {/each}
            </div>
        {/if}

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
                    {#if !open && others.length}
                        <!-- PEOPLE | who else sees this note -->
                        <span class="mr-1 flex -space-x-1.5" role="img" aria-label={`Shared ${mine ? 'with' : 'by'} ${others.map(nameOf).join(', ')}`} in:appear out:unfold={{ axis: 'x' }}>
                            {#each others.slice(0, 3) as person (person)}<Initials name={nameOf(person)} class="ring-2 ring-[var(--note-bg,var(--theme-card))]" />{/each}
                        </span>
                    {/if}
                    {#if open}
                        <div class="extra hidden items-center gap-0.5 @min-[26rem]/note:flex" in:appear out:unfold={{ axis: 'x' }}>{@render actions()}</div>
                    {/if}
                    {#if open || draft.pinned}
                        <button
                            class={['icon-button', draft.pinned ? 'text-accent hover:text-accent' : 'extra']}
                            tabindex={open ? 0 : -1}
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

    /* Scrolled into view clear of the floating toolbar, and of the bottom rail on phones */
    .note.open {
        scroll-margin-block: 1.5rem calc(11rem + env(safe-area-inset-bottom));
    }

    @media (width >= 40rem) {
        .note.open {
            scroll-margin-block-end: 7.5rem;
        }
    }

    .card.selected {
        outline: 2px solid var(--theme-accent);
        outline-offset: 3px;
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

    /* The top corners follow the card, the border sits outside */
    .images {
        border-top-left-radius: calc(var(--layout-radius-card) - 1px);
        border-top-right-radius: calc(var(--layout-radius-card) - 1px);
    }

    .remove-image {
        background: rgb(0 0 0 / 0.55);
        color: white;
        transition: opacity var(--duration-fast) var(--ease-in), background-color var(--duration-fast) var(--ease-out);
    }

    .remove-image:hover {
        background: rgb(0 0 0 / 0.75);
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
