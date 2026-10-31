<script lang="ts">
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import LabelAdder from '#lib/components/LabelAdder.svelte';
    import MarkdownEditor from '#lib/components/MarkdownEditor.svelte';
    import ReminderList from '#lib/components/ReminderList.svelte';
    import { emptyNote, isEmpty } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import type { Label, Note, NoteContent, Reminder } from '#lib/schemas.ts';
    import { Archive, ArchiveRestore, Check, Pin, PinOff, Trash2, X } from '@lucide/svelte';
    import { untrack } from 'svelte';
    import { createNote, deleteNote, updateNote } from '../../routes/api/notes.remote';
    import { setReminderDone } from '../../routes/api/reminders.remote';

    // PROPS
    let {
        note,
        labels,
        reminders,
        focus,
        oncreate,
        onclose
    }: {
        note: Note | null                       // null starts a new note
        labels: Label[]
        reminders: Reminder[]
        focus?: string                          // reminder to open right away, see ReminderList
        oncreate?: (id: string) => void         // a new note got stored, the page follows it by id from then on
        onclose: () => void
    } = $props()

    // DRAFT | edited freely, the page's copy only changes once a save went through
    const initial = untrack(() => note)
    let id = $state(initial?.id)
    let draft = $state<NoteContent>(initial ? contentOf(initial) : emptyNote())
    let saved = untrack(() => JSON.stringify(draft))
    let confirmDelete = $state(false)
    let deleted = false
    let card = $state<HTMLElement>()

    let labelsById = $derived(new Map(labels.map((label) => [label.id, label])))
    let tabs = $derived(draft.labels.map((labelId) => labelsById.get(labelId)).filter((label) => !!label))

    function contentOf(note: Note): NoteContent {
        const { title, body, color, labels, pinned, archived } = note
        return { title, body, color, labels: [...labels], pinned, archived }
    }

    // SAVING | one save at a time, a new note gets created exactly once
    let queue: Promise<unknown> = Promise.resolve()

    function save(): Promise<string | null> {
        const run = queue.then(async () => {
            const snapshot = JSON.stringify(draft)
            if(deleted || snapshot === saved) return id ?? null
            if(!id && isEmpty(draft)) return null

            const content = $state.snapshot(draft)
            const result = await safeAction(id ? updateNote({ id, ...content }) : createNote(content))
            if(result){
                if(!id) oncreate?.(result.id)
                id = result.id
                saved = snapshot
            }
            return id ?? null
        })
        queue = run
        return run
    }

    // Autosave a moment after typing stops, and once more when the card folds back
    $effect(() => {
        JSON.stringify(draft)
        const timer = setTimeout(save, 900)
        return () => clearTimeout(timer)
    })

    $effect(() => () => { save() })

    // A reminder needs a stored note, an empty new one gets created on demand
    async function ensureNote(): Promise<string | null> {
        if(!id && isEmpty(draft)) draft.title = 'Reminder'
        return await save()
    }

    // ACTIONS
    function archive(){
        draft.archived = !draft.archived
        if(draft.archived) draft.pinned = false     // pinned only matters among active notes
        onclose()
    }

    async function remove(){
        if(!confirmDelete){
            confirmDelete = true
            return
        }
        await queue
        if(id && !await safeAction(deleteNote(id))) return
        deleted = true
        onclose()
    }

    // CLOSE | a press anywhere else or Escape folds the card back, popovers opened from it count as inside
    const FLOATING = '[data-bits-floating-content-wrapper], [data-popover-content]'

    function pressOutside(event: PointerEvent){
        const target = event.target as Element
        if(card?.contains(target) || target.closest(FLOATING)) return
        onclose()
    }

    function escape(event: KeyboardEvent){
        if(event.key !== 'Escape' || event.defaultPrevented || document.querySelector(`${FLOATING}[data-state='open']`)) return
        onclose()
    }
</script>

<svelte:window onpointerdown={pressOutside} onkeydown={escape} />

<article
    bind:this={card}
    class="editor note-surface relative flex flex-col gap-4 rounded-card border border-line-strong p-card text-ink shadow-2xl"
    data-note={draft.color || undefined}
    aria-label={id ? 'Edit note' : 'New note'}
>

    <!-- LABELS | open tabs with a remove button, the add tab keeps to the far end -->
    <div class="tabs absolute flex gap-1">
        {#each tabs as label (label.id)}
            <span class="tab note-mark type-meta flex min-w-0 items-center gap-0.5 pr-0.5 pl-2.5" data-note={label.color || undefined}>
                <span class="truncate">{label.name}</span>
                <button class="remove grid shrink-0 place-items-center rounded-full p-0.5" aria-label={`Remove ${label.name}`} onclick={() => draft.labels = draft.labels.filter((item) => item !== label.id)}>
                    <X class="size-3" />
                </button>
            </span>
        {/each}
        <LabelAdder class="ml-auto shrink-0" {labels} taken={draft.labels} onadd={(labelId) => draft.labels = [...draft.labels, labelId]} />
    </div>

    <!-- TITLE -->
    <div class="flex items-start gap-2">
        <input bind:value={draft.title} placeholder="Title" aria-label="Title" class="type-title min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-ink-faint" />
        <button class={['icon-button -mt-1 -mr-2', draft.pinned && 'text-accent']} aria-label={draft.pinned ? 'Unpin' : 'Pin'} aria-pressed={draft.pinned} onclick={() => draft.pinned = !draft.pinned}>
            {#if draft.pinned}<PinOff class="size-4" />{:else}<Pin class="size-4" />{/if}
        </button>
    </div>

    <!-- BODY -->
    <MarkdownEditor bind:value={draft.body} autofocus={!initial?.title && !focus} />

    <!-- TOOLBAR -->
    <div class="-mx-2 -mt-2 flex items-center gap-1">
        <ColorPicker value={draft.color} onpick={(color) => draft.color = color} label="Note color" class="ml-2" />

        <div class="ml-auto flex items-center gap-1">
            <button class="icon-button" aria-label={draft.archived ? 'Unarchive' : 'Archive'} onclick={archive}>
                {#if draft.archived}<ArchiveRestore class="size-4" />{:else}<Archive class="size-4" />{/if}
            </button>
            <button class={['icon-button', confirmDelete && 'bg-accent text-on-accent hover:text-on-accent']} aria-label={confirmDelete ? 'Confirm delete' : 'Delete'} onclick={remove} onblur={() => confirmDelete = false}>
                <Trash2 class="size-4" />
            </button>
            <button class="icon-button" aria-label="Done" onclick={onclose}><Check class="size-4" /></button>
        </div>
    </div>

    <!-- REMINDERS -->
    <ReminderList {reminders} {ensureNote} {focus} editable ondone={(reminder) => safeAction(setReminderDone({ id: reminder.id, done: true }))} />
</article>

<style>
    /* TABS | spread over the straight part of the top edge, or the bottom one as picked in the settings */
    .tabs {
        bottom: 100%;
        left: var(--layout-radius-card);
        right: var(--layout-radius-card);
        height: 1.375rem;
        align-items: stretch;
    }

    .tab {
        border-radius: 0.375rem 0.375rem 0 0;
    }

    :global([data-labels='bottom']) .tabs {
        top: 100%;
        bottom: auto;
    }

    :global([data-labels='bottom']) .tab {
        border-radius: 0 0 0.375rem 0.375rem;
    }

    .remove {
        opacity: 0.6;
        transition: opacity var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .remove:hover {
        opacity: 1;
        background: color-mix(in oklab, currentColor 15%, transparent);
    }
</style>
