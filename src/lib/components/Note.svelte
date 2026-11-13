<script lang="ts">
    import { page } from '$app/state';
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import ReminderList from '#lib/components/ReminderList.svelte';
    import NoteAttachments from '#lib/components/NoteAttachments.svelte';
    import NoteImages from '#lib/components/NoteImages.svelte';
    import NoteTabs from '#lib/components/NoteTabs.svelte';
    import ShareEditor from '#lib/components/ShareEditor.svelte';
    import { imagesIn } from '#lib/images.ts';
    import { IMAGE_TYPES } from '#lib/schema_limits.ts';
    import { longPress } from '#lib/long_press.ts';
    import { toggleTask } from '#lib/markdown.ts';
    import { appear, unfold } from '#lib/motion.ts';
    import { noteEditor } from '#lib/note_editor.svelte.ts';
    import { NoteExtras } from '#lib/note_extras.svelte.ts';
    import { kept } from '#lib/note_list.ts';
    import { holdKey, lost, sealBody } from '#lib/note_lock.svelte.ts';
    import { NoteSession } from '#lib/note_session.svelte.ts';
    import { offerArchiveUndo } from '#lib/note_removal.ts';
    import { archiveChange } from '#lib/notes.ts';
    import { closeOnOutside } from '#lib/overlays.ts';
    import { autoColorOrder, shownColor } from '#lib/auto_colors.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { Label, Note, NoteColor, NoteContent, Person } from '#lib/schemas/notes.ts';
    import type { Reminder } from '#lib/schemas/reminders.ts';
    import type { FileLimits } from '#lib/schemas/users.ts';
    import { showHistory } from '#lib/singletons/reminder_history.svelte.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Archive, ArchiveRestore, Check, ImagePlus, Lock, LockKeyhole, LockOpen, LogOut, Paperclip, Pin, Trash2 } from '@lucide/svelte';
    import { untrack } from 'svelte';
    import { updateNote } from '../../routes/api/notes.remote';

    /*
        One note, closed as a card in the grid or open for editing. Opening keeps every element
        and only adds the controls around them, so the page can glide the card to its new size.
    */

    // PROPS
    let {
        note,
        defaults,
        seed,
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
        onselect,
        onlabel,
        oncreate,
        onclose
    }: {
        note: Note | null                                       // null starts a new note, which comes open
        defaults?: Partial<NoteContent>                         // what a new note begins with, like the labels its view asks for
        seed?: { content: Partial<NoteContent>, files: File[] } | null      // came from outside, saved without a keystroke
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
        onselect?: () => void                                   // the select button on a hovered card
        onlabel?: (id: string) => void                          // narrows the view to a label picked on a tab
        oncreate?: (id: string) => void                         // a new note got stored, the page follows it by id from then on
        onclose?: () => void
    } = $props()

    // SESSION | saving and backup live there, the card only shows the draft
    const session = new NoteSession({
        note: () => note,
        open: () => open,
        me: () => me,
        fresh: () => ({ ...defaults, ...seed?.content }),
        unsaved: () => !!seed,
        created: (id) => oncreate?.(id),
        close: () => onclose?.()
    })
    let id = $derived(session.id)
    let stored = $derived(id ?? '')         // Stored files only exist once the note does
    let draft = $derived(session.draft)
    let owned = $derived(session.owned)
    let shown = $derived(shownColor(draft, autoColorOrder(labels)))

    // Default goes back to the account's color, which labels still paint over
    function pickColor(color: NoteColor){
        const fallback = color ? '' : page.data.user?.noteColor ?? ''
        draft.color = color || fallback
        draft.colorDefault = !!fallback
    }
    let card = $state<HTMLElement>()

    // For the page, which waits on a new note before it hands the card over
    export function flush(): Promise<string | null> {
        return session.save()
    }

    $effect(() => {
        if(open) noteEditor.load()
    })

    // LOCK | only the owner's stored notes, unshared and without files | a new card never learns of its lock
    let locked = $derived(!!note?.sealed)
    let unreadable = $derived(!!note?.unreadable)
    let gone = $derived(!!note && lost(note))

    // An open locked note keeps the tab from locking again
    $effect(() => {
        if(open && locked) return holdKey()
    })

    // FILES AND PEOPLE
    let limits: FileLimits = $derived(page.data.limits)
    const extras = new NoteExtras({ session, note: () => note, limits: () => limits })
    let picker = $state<HTMLInputElement>()
    let filePicker = $state<HTMLInputElement>()

    $effect(() => {
        untrack(() => { if(seed?.files.length) extras.addImages(seed.files) })
    })

    // The owner picks who else sees the note, the others see whose it is
    let names = $derived(new Map(people.map((person) => [person.id, person.name])))
    let others = $derived((owned ? extras.shared : [note!.owner, ...extras.shared.filter((person) => person !== me)]).map((person) => ({ id: person, name: names.get(person) ?? 'Someone' })))
    let othersTip = $derived(owned ? `Shared with ${others.map((person) => person.name).join(', ')}` : `From ${others[0]?.name}`)
    let lockable = $derived(!!note && owned && (locked || !extras.shared.length && !extras.images.length && !extras.attachments.length && !extras.uploads.length && !extras.sending.length))

    // Pasted or dropped onto the open note | caught before the editor, which would ignore them or paste a file name
    function catchFiles(event: Event, list?: FileList | null){
        const files = [...list ?? []]
        const pictures = imagesIn(files)
        const others = limits.attachments ? files.filter((file) => !pictures.includes(file)) : []
        if(!open || locked || (!pictures.length && !others.length)) return

        event.preventDefault()
        event.stopPropagation()
        if(pictures.length) extras.addImages(pictures)
        if(others.length) extras.addAttachments(others)
    }

    function dragOver(event: DragEvent){
        if(open && event.dataTransfer?.types.includes('Files')) event.preventDefault()
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
        card?.querySelector<HTMLElement>('[data-note-text]')?.focus()
    }

    // CARD CLICKS | checkboxes and the hover buttons sit above the cover button
    function clickTask(event: MouseEvent){
        const box = event.target
        if(open || !note || unreadable || !(box instanceof HTMLInputElement) || !box.classList.contains('task')) return
        const tasks = [...(event.currentTarget as HTMLElement).querySelectorAll('input.task')]
        const { id } = note
        const body = toggleTask(note.body, tasks.indexOf(box))
        safeAction(kept(locked ? sealBody(body).then((sealed) => updateNote({ id, sealed })) : updateNote({ id, body })))
    }

    function pinClosed(){
        if(note) safeAction(kept(updateNote({ id: note.id, pinned: !note.pinned })))
    }

    async function archiveClosed(){
        if(!note) return
        const { id, archived, pinned } = note
        if(await safeAction(kept(updateNote({ id, ...archiveChange(note, !archived) })))) offerArchiveUndo([{ id, archived, pinned }], !archived)
    }
</script>

{#snippet actions()}
    {#if !locked}
        <button class="icon-button" aria-label="Add images" onclick={() => picker?.click()} {@attach tip('Add images')}>
            <ImagePlus class="size-4" />
        </button>
        {#if limits.attachments}
            <button class="icon-button" aria-label="Attach files" onclick={() => filePicker?.click()} {@attach tip('Attach files')}>
                <Paperclip class="size-4" />
            </button>
        {/if}
        {#if owned}
            <ShareEditor people={people.filter((person) => person.id !== me)} shared={extras.shared} onchange={extras.share} />
        {/if}
    {/if}
    {#if lockable}
        <button class="icon-button" aria-label={locked ? 'Unlock' : 'Lock'} onclick={() => session.setLocked(!locked)} {@attach tip(locked ? 'Unlock note' : 'Lock with your password')}>
            {#if locked}<LockOpen class="size-4" />{:else}<Lock class="size-4" />{/if}
        </button>
    {/if}
    <ColorPicker value={draft.colorDefault ? '' : draft.color} labels={labels.filter((item) => draft.labels.includes(item.id))} onpick={pickColor} label="Note color" class="ml-1 mr-2" />
    {#if owned}
        <button class="icon-button" aria-label={draft.archived ? 'Unarchive' : 'Archive'} onclick={session.archive} {@attach tip(draft.archived ? 'Back to the notes' : 'Archive')}>
            {#if draft.archived}<ArchiveRestore class="size-4" />{:else}<Archive class="size-4" />{/if}
        </button>
    {/if}
    <!-- Someone else's note can only be left, it stays with its owner -->
    <button class="icon-button" aria-label={owned ? 'Delete' : 'Leave'} onclick={session.remove} {@attach tip(owned ? 'Delete note' : 'Leave this note')}>
        {#if owned}<Trash2 class="size-4" />{:else}<LogOut class="size-4" />{/if}
    </button>
{/snippet}

<!-- The tabs sit beside the colored card, not on it, so they keep the page ink -->
<div class={['note relative', open && 'open', (closing || !open) && 'folded']} data-flip-body data-note-open={open ? '' : undefined} {@attach open ? closeOnOutside(() => onclose?.()) : null}>

    <!-- SELECT | on the corner, faint on hover, filled once selected -->
    {#if !open}
        <button
            class={['select-mark absolute -top-2 -right-2 z-20 grid size-6 place-items-center rounded-full border', selected ? 'selected border-accent bg-accent text-on-accent shadow-md' : 'border-line-strong bg-raised text-ink-faint hover:text-accent']}
            aria-label={selected ? 'Deselect' : 'Select'}
            aria-pressed={selected}
            onclick={onselect}
            {@attach tip(selected ? 'Deselect' : 'Select')}
        >
            <Check class="size-3.5" strokeWidth={3} />
        </button>
    {/if}

    <NoteTabs bind:picked={draft.labels} {labels} {open} {owned} onfilter={onlabel} />

    <article
        bind:this={card}
        data-flip-card
        class={['card note-surface relative flex flex-col gap-3 rounded-card border p-card text-ink', open ? 'border-line-strong shadow-2xl' : 'border-line hover:border-line-strong', selected && 'selected']}
        data-note={shown || undefined}
        aria-label={open ? (id ? 'Edit note' : 'New note') : undefined}
        {@attach longPress(() => !open, () => onlongpress?.())}
        onpastecapture={(event) => catchFiles(event, event.clipboardData?.files)}
        ondragovercapture={dragOver}
        ondropcapture={(event) => catchFiles(event, event.dataTransfer?.files)}
    >
        {#if !open}
            <button class="cover absolute inset-0 rounded-card" aria-label={`Open ${draft.title || 'note'}`} aria-pressed={selected || undefined} onpointerenter={noteEditor.load} onfocus={noteEditor.load} onclick={onopen}></button>

            <!-- Above the cover, aligned with the header pin -->
            {#if owned}
                <div class="hover-actions absolute top-[calc(var(--spacing-card)-0.25rem)] right-[calc(var(--spacing-card)-0.5rem)] z-10 flex items-center gap-0.5">
                    <button class="icon-button" aria-label={draft.archived ? 'Unarchive' : 'Archive'} onclick={archiveClosed} {@attach tip(draft.archived ? 'Back to the notes' : 'Archive')}>
                        {#if draft.archived}<ArchiveRestore class="size-4" />{:else}<Archive class="size-4" />{/if}
                    </button>
                    <button class={['icon-button', draft.pinned && 'text-accent hover:text-accent']} aria-label={draft.pinned ? 'Unpin' : 'Pin'} aria-pressed={draft.pinned} onclick={pinClosed} {@attach tip(draft.pinned ? 'Unpin' : 'Pin to the top')}>
                        <Pin class="size-4" fill={draft.pinned ? 'currentColor' : 'none'} />
                    </button>
                </div>
            {/if}
        {/if}

        <!-- IMAGES | on top, edge to edge, the pickers sit hidden for the buttons among the actions -->
        <NoteImages note={stored} images={extras.images} uploads={extras.uploads} editable={open} alone={!open && !draft.title && !draft.body && !draft.pinned && !reminders.length && !extras.attachments.length} onremove={(name) => extras.drop('images', name)} />
        <input bind:this={picker} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onchange={(event) => {
            extras.addImages(imagesIn(event.currentTarget.files))
            event.currentTarget.value = ''
        }} />
        <input bind:this={filePicker} type="file" multiple hidden onchange={(event) => {
            extras.addAttachments([...event.currentTarget.files ?? []])
            event.currentTarget.value = ''
        }} />

        <!-- TITLE | colour, archive and delete join the pin up here once the note is wide enough -->
        {#if open || draft.title || draft.pinned || others.length || locked}
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
                <div class={['-my-1 -mr-2 flex items-center gap-0.5', !open && owned && 'pin-room', draft.pinned && 'pinned']}>
                    {#if locked && !open}
                        <span class="pointer-events-auto relative z-10 grid size-8 place-items-center text-ink-faint" role="img" aria-label={gone ? 'Text lost' : 'Locked'} {@attach tip(gone ? 'Locked before a password reset, its text is lost' : 'Locked with your password')}><LockKeyhole class={unreadable ? 'size-5' : 'size-4'} /></span>
                    {/if}
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
                        <div class="open-only hidden items-center gap-0.5 @min-[26rem]/note:flex" in:appear out:unfold={{ axis: 'x' }}>{@render actions()}</div>
                    {/if}
                    {#if (open && owned) || draft.pinned}
                        <button
                            class={['header-pin icon-button', draft.pinned ? 'text-accent hover:text-accent' : 'open-only']}
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
            <div class={['content flex flex-col gap-2', !open && 'pointer-events-none']} onclick={clickTask} in:appear out:unfold>
                {#if open && noteEditor.component}
                    <noteEditor.component bind:value={draft.body} autofocus={!draft.title && !focus} />
                {:else}
                    <Markdown source={draft.body} class={['text-ink-muted', open ? 'min-h-32' : 'line-clamp-[12]']} />
                    {#if open}
                        <div class="open-only flex min-h-8 items-center gap-1.5" aria-hidden="true" in:appear out:unfold>
                            {#each { length: 7 }, index (index)}<span class="skeleton size-5 rounded-md"></span>{/each}
                            <span class="skeleton ml-auto size-5 rounded-md"></span>
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}

        <!-- Stripes over a locked note until its password opens it -->
        {#if locked}
            <div class={['veil', unreadable && !open && 'shown']} aria-hidden="true"></div>
        {/if}

        <!-- ATTACHMENTS -->
        {#if extras.attachments.length || extras.sending.length}
            <NoteAttachments note={stored} attachments={extras.attachments} fileInfo={extras.fileInfo} sending={extras.sending} {open} onremove={(name) => extras.drop('attachments', name)} />
        {/if}

        <!-- ACTIONS | their own row below the text while the note is narrow -->
        {#if open}
            <div class="open-only -mx-2 -mt-2 flex items-center gap-0.5 @min-[26rem]/note:hidden" in:appear out:unfold>{@render actions()}</div>
        {/if}

        <!-- REMINDERS -->
        <ReminderList {reminders} ensureNote={session.ensureNote} focus={open ? focus : undefined} editable={open} onhistory={(anchor) => id && showHistory({ id, title: draft.title, color: shown }, anchor)} />
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
        z-index: 1;     /* Over the hover buttons' backdrop too */
        background: var(--theme-signature);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--duration-base) var(--ease-out);
    }

    .card.selected::after {
        opacity: 0.32;
    }

    /* VEIL | faint grey stripes over a locked note until it opens */
    .veil {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: repeating-linear-gradient(-45deg, color-mix(in oklab, var(--theme-ink-faint) 16%, transparent) 0 2px, transparent 2px 10px);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--duration-base) var(--ease-out);
    }

    .veil.shown {
        opacity: 1;
    }

    /* SELECT MARK | stays while selected, else shows on hover only */
    .select-mark {
        transition: opacity var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
    }

    .select-mark:not(.selected) {
        opacity: 0;
        pointer-events: none;
    }

    .note:hover .select-mark,
    .note:focus-within .select-mark {
        opacity: 1;
        pointer-events: auto;
    }

    /* HOVER ACTIONS | archive and pin over a closed card, it takes over from the header pin meanwhile */
    .hover-actions {
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--duration-fast) var(--ease-out);
    }

    .card:hover .hover-actions,
    .card:focus-within .hover-actions {
        opacity: 1;
        pointer-events: auto;
    }

    .header-pin {
        transition: opacity var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .card:has(.hover-actions):is(:hover, :focus-within) .header-pin {
        opacity: 0;
    }

    /* Lock and faces step aside for the hover pin, a moved box would repack the grid */
    .pin-room {
        transition: translate var(--duration-fast) var(--ease-out);
    }

    .card:is(:hover, :focus-within) .pin-room {
        translate: -4.125rem 0;
    }

    .card:is(:hover, :focus-within) .pin-room.pinned {
        translate: -2.125rem 0;     /* The header pin already holds one place */
    }

    /* The buttons sit on a copy of the card's own background, text under them hides | a full size copy keeps every pattern in line */
    .card:has(> .hover-actions)::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: inherit;
        background: inherit;
        clip-path: inset(
            calc(var(--spacing-card) - 0.25rem)
            calc(var(--spacing-card) - 0.5rem)
            calc(100% - var(--spacing-card) - 1.75rem)
            calc(100% - var(--spacing-card) - 3.875rem)
        );
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--duration-fast) var(--ease-out);
    }

    .card:is(:hover, :focus-within)::before {
        opacity: 1;
    }

    /* Fingers have no hover, they select by long press */
    @media (hover: none) {
        .hover-actions { display: none; }
        .card::before { display: none; }
        .select-mark:not(.selected) { display: none; }
        .card:is(:hover, :focus-within) .pin-room:is(*, .pinned) { translate: none; }
    }

    /* RESIZING | the card fills the box that glides to its new size, see glide() in #lib/relayout.ts */
    .note:global([data-resizing]) .card {
        height: 100%;
        overflow: clip;
    }

    /* Text squeezed by the glide would flash a scrollbar | hiding it keeps the scroll position, clipping would reset it */
    .note:global([data-resizing]) :global(:is([data-flip-card], .rich, textarea)) {
        scrollbar-width: none;
    }

    /* Raised above the cover button, which comes first */
    .content :global(input.task),
    .content :global(a) {
        pointer-events: auto;
        position: relative;
    }

    /* Syne runs wide at title weight, a card title needs less to stand out from the body */
    .title {
        font-weight: 620;
        letter-spacing: -0.02em;
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
