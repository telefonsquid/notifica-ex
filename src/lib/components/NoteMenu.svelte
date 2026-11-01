<script lang="ts">
    import { COLOR_GROUPS, colorName } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { describeRule } from '#lib/reminders.ts';
    import type { Label, Note, NoteColor, Reminder } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Archive, ArchiveRestore, BellOff, BellPlus, Check, ChevronRight, Copy, LogOut, Minus, Palette, Pin, PinOff, SquareCheck, Tag, Trash2, X } from '@lucide/svelte';
    import { DropdownMenu as Menu } from 'bits-ui';
    import { createNote, deleteNote, updateNote } from '../../routes/api/notes.remote';
    import { removeReminder } from '../../routes/api/reminders.remote';

    /*
        Items for the right click menu of a card and for the selection bar. Bits shares the item parts
        between its menus, so this renders inside a context menu as well as a dropdown.
    */

    // PROPS
    let {
        notes,
        me,
        labels,
        reminders,
        selected = false,
        onselect,
        onedit,
        onfinish
    }: {
        notes: Note[]                                           // one card, or the whole selection
        me: string                                              // notes of others only get left, not deleted
        labels: Label[]
        reminders: Map<string, Reminder[]>
        selected?: boolean
        onselect?: () => void                                   // adds the card to the selection or takes it out
        onedit?: (note: Note, focus: string) => void            // opens the card with a reminder form, 'new' for a blank one
        onfinish?: () => void                                   // the notes are gone from view, the selection can go
    } = $props()

    let single = $derived(notes.length === 1 ? notes[0] : null)
    let attached = $derived(notes.flatMap((note) => reminders.get(note.id) ?? []))
    let allPinned = $derived(notes.every((note) => note.pinned))
    let allArchived = $derived(notes.every((note) => note.archived))
    let confirmDelete = $state(false)
    let leaving = $derived(notes.every((note) => note.owner !== me))

    // ACTIONS | every note gets its own update, the list stays short enough for that
    async function each(change: (note: Note) => Promise<unknown>){
        await Promise.all(notes.map((note) => safeAction(change(note))))
    }

    function paint(color: NoteColor){
        each((note) => updateNote({ id: note.id, color }))
    }

    // A label goes on every note once one lacks it, otherwise it comes off all of them
    function toggleLabel(label: Label){
        const add = !notes.every((note) => note.labels.includes(label.id))
        each((note) => updateNote({ id: note.id, labels: add ? [...new Set([...note.labels, label.id])] : note.labels.filter((id) => id !== label.id) }))
    }

    function pin(){
        each((note) => updateNote({ id: note.id, pinned: !allPinned }))
    }

    async function archive(){
        await each((note) => updateNote({ id: note.id, archived: !allArchived, pinned: allArchived && note.pinned }))
        onfinish?.()
    }

    // Copies leave reminders behind, two pushes for the same thing would only confuse
    async function duplicate(){
        await each(({ title, body, color, labels, pinned, archived }) => createNote({ title, body, color, labels, pinned, archived }))
        onfinish?.()
    }

    function removeReminders(){
        Promise.all(attached.map((reminder) => safeAction(removeReminder(reminder.id))))
    }

    // The first select only arms it and keeps the menu open | bits reads closeOnSelect after this ran, so it can't do that
    async function remove(event: Event){
        if(!confirmDelete){
            event.preventDefault()
            confirmDelete = true
            return
        }
        await each((note) => deleteNote(note.id))
        onfinish?.()
    }
</script>

{#if onselect}
    <Menu.Item class="menu-item" onSelect={onselect}>
        <SquareCheck class="size-4" />{selected ? 'Deselect' : 'Select'}
    </Menu.Item>
    <Menu.Separator class="menu-separator" />
{/if}

<!-- COLOR -->
<Menu.Sub>
    <Menu.SubTrigger class="menu-item"><Palette class="size-4" />Color<ChevronRight class="ml-auto size-3.5" /></Menu.SubTrigger>
    <Menu.SubContent class="menu grid gap-3 p-3" sideOffset={6}>
        {#each COLOR_GROUPS as group (group.name)}
            <div class="grid grid-cols-[repeat(6,1.75rem)] gap-1.5 min-[24rem]:grid-cols-[repeat(9,1.75rem)]">
                {#each group.colors as color (color)}
                    {@const picked = notes.every((note) => note.color === color)}
                    <Menu.Item
                        class={['motion-interactive size-7 rounded-full data-highlighted:scale-110', picked && 'outline-2 outline-offset-2 outline-accent']}
                        aria-label={colorName(color)}
                        {@attach tip(colorName(color))}
                        closeOnSelect={false}
                        onSelect={() => paint(color)}
                    >
                        <span class="swatch note-surface grid size-full place-items-center rounded-full border border-line-strong text-ink" data-note={color || undefined}>
                            {#if picked}<Check class="size-3.5" strokeWidth={3} />{/if}
                        </span>
                    </Menu.Item>
                {/each}
            </div>
        {/each}
    </Menu.SubContent>
</Menu.Sub>

<!-- LABELS | a dash marks labels only some of the notes carry -->
<Menu.Sub>
    <Menu.SubTrigger class="menu-item"><Tag class="size-4" />Labels<ChevronRight class="ml-auto size-3.5" /></Menu.SubTrigger>
    <Menu.SubContent class="menu max-h-80 overflow-y-auto" sideOffset={6}>
        {#each labels as label (label.id)}
            {@const count = notes.filter((note) => note.labels.includes(label.id)).length}
            <Menu.CheckboxItem class="menu-item" checked={count === notes.length} indeterminate={count > 0 && count < notes.length} closeOnSelect={false} onCheckedChange={() => toggleLabel(label)}>
                {#snippet children({ checked, indeterminate })}
                    <span class="note-mark h-1.5 w-3 shrink-0 rounded-full" data-note={label.color || undefined}></span>
                    <span class="truncate">{label.name}</span>
                    {#if checked}<Check class="ml-auto size-3.5" />{:else if indeterminate}<Minus class="ml-auto size-3.5" />{/if}
                {/snippet}
            </Menu.CheckboxItem>
        {:else}
            <p class="type-meta px-2.5 py-2 text-ink-faint">No labels yet</p>
        {/each}
    </Menu.SubContent>
</Menu.Sub>

<!-- REMINDERS | editing needs the open card, so only a single note offers it -->
{#if single && onedit}
    <Menu.Sub>
        <Menu.SubTrigger class="menu-item"><BellPlus class="size-4" />Reminders<ChevronRight class="ml-auto size-3.5" /></Menu.SubTrigger>
        <Menu.SubContent class="menu w-64" sideOffset={6}>
            {#each attached as reminder (reminder.id)}
                <div class="flex">
                    <Menu.Item class="menu-item min-w-0 flex-1" onSelect={() => onedit(single, reminder.id)}>
                        <span class="truncate">{describeRule(reminder)}</span>
                    </Menu.Item>
                    <Menu.Item class="menu-item" aria-label={`Remove reminder ${describeRule(reminder)}`} onSelect={() => safeAction(removeReminder(reminder.id))}>
                        <X class="size-3.5" />
                    </Menu.Item>
                </div>
            {/each}
            {#if attached.length}<Menu.Separator class="menu-separator" />{/if}
            <Menu.Item class="menu-item" onSelect={() => onedit(single, 'new')}><BellPlus class="size-4" />Add reminder</Menu.Item>
        </Menu.SubContent>
    </Menu.Sub>
{:else if attached.length}
    <Menu.Item class="menu-item" onSelect={removeReminders}><BellOff class="size-4" />Remove reminders</Menu.Item>
{/if}

<Menu.Separator class="menu-separator" />

<Menu.Item class="menu-item" onSelect={pin}>
    {#if allPinned}<PinOff class="size-4" />Unpin{:else}<Pin class="size-4" />Pin{/if}
</Menu.Item>
<Menu.Item class="menu-item" onSelect={duplicate}><Copy class="size-4" />Duplicate</Menu.Item>
<Menu.Item class="menu-item" onSelect={archive}>
    {#if allArchived}<ArchiveRestore class="size-4" />Unarchive{:else}<Archive class="size-4" />Archive{/if}
</Menu.Item>

<!-- Asks once more in place before anything is gone | notes shared by others only get left -->
<Menu.Item class={['menu-item', confirmDelete && 'bg-accent text-on-accent data-highlighted:bg-accent data-highlighted:text-on-accent']} onSelect={remove}>
    {#if leaving}<LogOut class="size-4" />{:else}<Trash2 class="size-4" />{/if}
    {confirmDelete ? `Click again to ${leaving ? 'leave' : 'delete'}` : leaving ? 'Leave' : 'Delete'}{notes.length > 1 ? ` ${notes.length} notes` : ''}
</Menu.Item>
