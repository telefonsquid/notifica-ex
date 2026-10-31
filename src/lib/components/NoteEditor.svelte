<script lang="ts">
    import ChecklistEditor from '#lib/components/ChecklistEditor.svelte';
    import ReminderEditor from '#lib/components/ReminderEditor.svelte';
    import { NOTE_BACKGROUNDS, convertKind, emptyNote, isEmpty } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { NOTE_COLORS, type Label, type Note, type NoteColor, type NoteContent, type NoteKind, type Reminder } from '#lib/schemas.ts';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Archive, ArchiveRestore, Check, Eye, Pencil, Pin, PinOff, Plus, Trash2, X } from '@lucide/svelte';
    import { Dialog } from 'bits-ui';
    import { untrack } from 'svelte';
    import { createLabel } from '../../routes/api/labels.remote';
    import { createNote, deleteNote, updateNote } from '../../routes/api/notes.remote';

    // PROPS
    let {
        note,
        kind = 'text',
        labels,
        reminders,
        onclose
    }: {
        note: Note | null                       // null starts a new note of the given kind
        kind?: NoteKind
        labels: Label[]
        reminders: Map<string, Reminder>        // by note id, a new note finds its reminder once saved
        onclose: () => void
    } = $props()

    const KINDS: { value: NoteKind, label: string }[] = [
        { value: 'text', label: 'Text' },
        { value: 'list', label: 'List' },
        { value: 'markdown', label: 'Markdown' },
    ]

    const COLORS: NoteColor[] = ['', ...NOTE_COLORS]

    // DRAFT | edited freely, the page's copy only changes once a save went through
    const initial = untrack(() => note)
    let id = $state(initial?.id)
    let reminder = $derived(id ? reminders.get(id) : undefined)
    let draft = $state<NoteContent>(initial ? contentOf(initial) : emptyNote(untrack(() => kind)))
    let saved = untrack(() => JSON.stringify(draft))
    let open = $state(true)
    let preview = $state(initial?.kind === 'markdown' && !!initial.body)
    let confirmDelete = $state(false)
    let deleted = false

    function contentOf(note: Note): NoteContent {
        const { title, kind, body, color, labels, pinned, archived } = note
        return { title, kind, body, items: $state.snapshot(note.items ?? []), color, labels: [...labels], pinned, archived }
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
                id = result.id
                saved = snapshot
            }
            return id ?? null
        })
        queue = run
        return run
    }

    // Autosave a moment after typing stops
    $effect(() => {
        JSON.stringify(draft)
        const timer = setTimeout(save, 900)
        return () => clearTimeout(timer)
    })

    // A reminder needs a stored note, an empty new one gets created on demand
    async function ensureNote(): Promise<string | null> {
        if(!id && isEmpty(draft)) draft.title = 'Reminder'
        return await save()
    }

    // ACTIONS
    function switchKind(next: NoteKind){
        if(next === draft.kind) return
        draft = convertKind(draft, next)
        preview = false
    }

    function toggleLabel(labelId: string){
        draft.labels = draft.labels.includes(labelId) ? draft.labels.filter((item) => item !== labelId) : [...draft.labels, labelId]
    }

    let newLabel = $state('')

    async function addLabel(){
        const name = newLabel.trim()
        if(!name) return
        const existing = labels.find((label) => label.name.toLowerCase() === name.toLowerCase())
        const label = existing ?? await safeAction(createLabel(name))
        if(label && !draft.labels.includes(label.id)) draft.labels = [...draft.labels, label.id]
        newLabel = ''
    }

    function archive(){
        draft.archived = !draft.archived
        if(draft.archived) draft.pinned = false     // pinned only matters among active notes
        save()
        open = false
    }

    async function remove(){
        if(!confirmDelete){
            confirmDelete = true
            return
        }
        await queue
        if(id && !await safeAction(deleteNote(id))) return
        deleted = true
        open = false
    }

    // CLOSE | saves once more, the dialog leaves while that runs
    function openChange(value: boolean){
        if(!value) save()
    }
</script>

<Dialog.Root bind:open onOpenChange={openChange} onOpenChangeComplete={(value) => { if(!value) onclose() }}>
    <Dialog.Portal>
        <Dialog.Overlay class="note-overlay fixed inset-0 z-50 bg-canvas/70 backdrop-blur-sm" />
        <Dialog.Content
            class={['note-dialog fixed top-[6dvh] left-1/2 z-50 flex max-h-[88dvh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-line-strong text-ink shadow-2xl', NOTE_BACKGROUNDS[draft.color]]}
        >
            <Dialog.Title class="sr-only">{id ? 'Edit note' : 'New note'}</Dialog.Title>

            <div class="flex flex-col gap-4 overflow-y-auto p-card">

                <!-- TITLE -->
                <div class="flex items-start gap-2">
                    <input bind:value={draft.title} placeholder="Title" aria-label="Title" class="type-title min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-ink-faint" />
                    <button class={['icon-button', draft.pinned && 'text-accent']} aria-label={draft.pinned ? 'Unpin' : 'Pin'} aria-pressed={draft.pinned} onclick={() => draft.pinned = !draft.pinned}>
                        {#if draft.pinned}<PinOff class="size-4" />{:else}<Pin class="size-4" />{/if}
                    </button>
                </div>

                <!-- KIND -->
                <div class="flex items-center gap-1 self-start rounded-control bg-line p-1" role="group" aria-label="Kind">
                    {#each KINDS as option (option.value)}
                        <button
                            class={['type-meta motion-interactive rounded-[calc(var(--layout-radius-control)-0.25rem)] px-3 py-1.5', draft.kind === option.value ? 'bg-raised text-ink' : 'text-ink-faint hover:text-ink-muted']}
                            aria-pressed={draft.kind === option.value}
                            onclick={() => switchKind(option.value)}
                        >{option.label}</button>
                    {/each}
                    {#if draft.kind === 'markdown'}
                        <button class="icon-button ml-1" aria-label={preview ? 'Edit' : 'Preview'} aria-pressed={preview} onclick={() => preview = !preview}>
                            {#if preview}<Pencil class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
                        </button>
                    {/if}
                </div>

                <!-- BODY -->
                {#if draft.kind === 'list'}
                    <ChecklistEditor bind:items={draft.items} />
                {:else if draft.kind === 'markdown' && preview}
                    <button class="flex min-h-32 flex-col text-left text-ink-muted" aria-label="Edit text" onclick={() => preview = false}>
                        <Markdown source={draft.body || '*Nothing written yet*'} />
                    </button>
                {:else}
                    <textarea
                        bind:value={draft.body}
                        placeholder={draft.kind === 'markdown' ? 'Write in markdown' : 'Write something'}
                        aria-label="Text"
                        class="field-sizing-content min-h-32 resize-none bg-transparent leading-relaxed text-ink-muted outline-none placeholder:text-ink-faint"
                        {@attach (node) => { if(!untrack(() => draft.title)) node.focus() }}
                    ></textarea>
                {/if}

                <!-- LABELS -->
                <div class="flex flex-wrap items-center gap-1.5">
                    {#each labels as label (label.id)}
                        {@const active = draft.labels.includes(label.id)}
                        <button
                            class={['type-meta motion-interactive flex items-center gap-1 rounded-full border px-2.5 py-1', active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-faint hover:text-ink-muted']}
                            aria-pressed={active}
                            onclick={() => toggleLabel(label.id)}
                        >
                            {#if active}<Check class="size-3" />{/if}{label.name}
                        </button>
                    {/each}
                    <form class="flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5" onsubmit={(event) => { event.preventDefault(); addLabel() }}>
                        <Plus class="size-3 text-ink-faint" />
                        <input bind:value={newLabel} placeholder="Label" aria-label="New label" class="type-meta w-20 bg-transparent py-0.5 outline-none placeholder:text-ink-faint" />
                    </form>
                </div>

                <!-- REMINDER -->
                <ReminderEditor {reminder} {ensureNote} />

            </div>

            <!-- TOOLBAR -->
            <footer class="flex items-center gap-1 border-t border-line px-3 py-2">
                <div class="flex items-center gap-1" role="radiogroup" aria-label="Color">
                    {#each COLORS as color (color)}
                        <button
                            class={['swatch motion-interactive size-6 rounded-full border', NOTE_BACKGROUNDS[color], draft.color === color ? 'border-accent' : 'border-line-strong hover:scale-110']}
                            role="radio"
                            aria-checked={draft.color === color}
                            aria-label={color || 'Default'}
                            onclick={() => draft.color = color}
                        ></button>
                    {/each}
                </div>

                <div class="ml-auto flex items-center gap-1">
                    <button class="icon-button" aria-label={draft.archived ? 'Unarchive' : 'Archive'} onclick={archive}>
                        {#if draft.archived}<ArchiveRestore class="size-4" />{:else}<Archive class="size-4" />{/if}
                    </button>
                    <button class={['icon-button', confirmDelete && 'bg-accent text-on-accent hover:text-on-accent']} aria-label={confirmDelete ? 'Confirm delete' : 'Delete'} onclick={remove} onblur={() => confirmDelete = false}>
                        <Trash2 class="size-4" />
                    </button>
                    <Dialog.Close class="icon-button" aria-label="Close"><X class="size-4" /></Dialog.Close>
                </div>
            </footer>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    /* Entry and exit run as css animations, bits ui waits for them before unmounting */
    :global(.note-overlay[data-state='open']) { animation: fade-in var(--duration-base) var(--ease-out); }
    :global(.note-overlay[data-state='closed']) { animation: fade-in var(--duration-fast) var(--ease-in) reverse forwards; }
    :global(.note-dialog[data-state='open']) { animation: dialog-in var(--duration-slow) var(--ease-out); }
    :global(.note-dialog[data-state='closed']) { animation: dialog-in var(--duration-fast) var(--ease-in) reverse forwards; }

    @keyframes fade-in {
        from { opacity: 0; }
    }

    @keyframes dialog-in {
        from { opacity: 0; transform: translateY(0.75rem) scale(0.98); filter: blur(4px); }
    }
</style>
