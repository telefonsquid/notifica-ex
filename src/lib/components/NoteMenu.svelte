<script lang="ts">
    import { COLOR_GROUPS, colorName } from '#lib/note_colors.ts';
    import { offerArchiveUndo, removeNotes } from '#lib/note_removal.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { describeRule, NEW_REMINDER } from '#lib/reminders.ts';
    import { archiveChange } from '#lib/notes.ts';
    import type { Label, Note, NoteColor } from '#lib/schemas/notes.ts';
    import type { Reminder } from '#lib/schemas/reminders.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { showHistory } from '#lib/singletons/reminder_history.svelte.ts';
    import { Archive, ArchiveRestore, BellOff, BellPlus, Check, ChevronRight, Copy, History, LogOut, Minus, Palette, Pin, PinOff, SquareCheck, Tag, Trash2, X } from '@lucide/svelte';
    import { DropdownMenu as Menu } from 'bits-ui';
    import { kept } from '#lib/note_list.ts';
    import { duplicateNote, updateNote } from '../../routes/api/notes.remote';
    import { removeReminder } from '../../routes/api/reminders.remote';

    /*
        Actions for the right click menu of a card, or as icon buttons for the selection bar. Bits shares the item parts
        between its menus, so the menu renders inside a context menu as well as a dropdown.
    */

    // PROPS
    let {
        notes,
        labels,
        me,
        reminders,
        selected = false,
        bar = false,
        onselect,
        onedit,
        onfinish
    }: {
        notes: Note[]                                           // one card, or the whole selection
        labels: Label[]
        me: string                                              // the signed in user, owner only actions skip notes shared with them
        reminders: Map<string, Reminder[]>
        selected?: boolean
        bar?: boolean                                           // icon buttons for the selection bar instead of menu items
        onselect?: () => void                                   // adds the card to the selection or takes it out
        onedit?: (note: Note, focus: string) => void            // opens the card with a reminder form, NEW_REMINDER for a blank one
        onfinish?: () => void                                   // the notes are gone from view, the selection can go
    } = $props()

    let single = $derived(notes.length === 1 ? notes[0] : null)
    let attached = $derived(notes.flatMap((note) => reminders.get(note.id) ?? []))
    let owned = $derived(notes.filter((note) => note.owner === me))
    let allPinned = $derived(owned.every((note) => note.pinned))
    let allArchived = $derived(owned.every((note) => note.archived))

    // Deleting a note shared with you only takes you off it
    let removeLabel = $derived(!owned.length ? 'Leave' : owned.length < notes.length ? 'Delete or leave' : 'Delete')

    // ACTIONS | every note gets its own update, the list stays short enough for that
    async function each(change: (note: Note) => Promise<Note>, among = notes){
        await Promise.all(among.map((note) => safeAction(kept(change(note)))))
    }

    function paint(color: NoteColor){
        each((note) => updateNote({ id: note.id, color }))
    }

    // A label goes on every note once one lacks it, otherwise it comes off all of them
    function toggleLabel(label: Label){
        const add = !owned.every((note) => note.labels.includes(label.id))
        each((note) => updateNote({ id: note.id, labels: add ? [...new Set([...note.labels, label.id])] : note.labels.filter((id) => id !== label.id) }), owned)
    }

    function pin(){
        each((note) => updateNote({ id: note.id, pinned: !allPinned }), owned)
    }

    async function archive(){
        const before = owned.map(({ id, archived, pinned }) => ({ id, archived, pinned }))
        const archiving = !allArchived
        await each((note) => updateNote({ id: note.id, ...archiveChange(note, archiving) }), owned)
        offerArchiveUndo(before, archiving)
        onfinish?.()
    }

    async function duplicate(){
        await each((note) => duplicateNote(note.id))
        onfinish?.()
    }

    function removeReminders(){
        Promise.all(attached.map((reminder) => safeAction(removeReminder(reminder.id))))
    }

    function remove(){
        removeNotes(notes, me)
        onfinish?.()
    }

    // The same actions in the same order for the bar and the menu
    let actions = $derived([
        { shown: owned.length > 0, label: allPinned ? 'Unpin' : 'Pin', icon: allPinned ? PinOff : Pin, run: pin },
        { shown: true, label: 'Duplicate', icon: Copy, run: duplicate },
        { shown: owned.length > 0, label: allArchived ? 'Unarchive' : 'Archive', icon: allArchived ? ArchiveRestore : Archive, run: archive },
        { shown: true, label: removeLabel, detail: notes.length > 1 ? ` ${notes.length} notes` : '', icon: owned.length ? Trash2 : LogOut, run: remove }
    ].filter((action) => action.shown))
</script>

{#snippet colorItems()}
    {#each COLOR_GROUPS as group (group.name)}
        <div class="grid w-[calc(9*1.75rem+8*0.375rem)] max-w-full grid-cols-[repeat(auto-fill,1.75rem)] gap-1.5">
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
{/snippet}

<!-- A dash marks labels only some of the notes carry, notes shared with you keep their owner's -->
{#snippet labelItems()}
    {#each labels as label (label.id)}
        {@const count = owned.filter((note) => note.labels.includes(label.id)).length}
        <Menu.CheckboxItem class="menu-item" checked={count === owned.length} indeterminate={count > 0 && count < owned.length} closeOnSelect={false} onCheckedChange={() => toggleLabel(label)}>
            {#snippet children({ checked, indeterminate })}
                <span class="note-mark h-1.5 w-3 shrink-0 rounded-full" data-note={label.color || undefined}></span>
                <span class="truncate">{label.name}</span>
                {#if checked}<Check class="ml-auto size-3.5" />{:else if indeterminate}<Minus class="ml-auto size-3.5" />{/if}
            {/snippet}
        </Menu.CheckboxItem>
    {:else}
        <p class="type-meta px-2.5 py-2 text-ink-faint">No labels yet</p>
    {/each}
{/snippet}

{#snippet actionItems()}
    {#each actions as action (action.run)}
        {#if bar}
            <button class="icon-button size-10 rounded-full" aria-label={action.label} onclick={action.run} {@attach tip(action.label)}><action.icon class="size-4.5" /></button>
        {:else}
            <Menu.Item class="menu-item" onSelect={action.run}><action.icon class="size-4" />{action.label}{action.detail}</Menu.Item>
        {/if}
    {/each}
{/snippet}

{#if bar}
    <!-- BAR | every action one click away, colour and labels pop up above -->
    <Menu.Root>
        <Menu.Trigger class="icon-button size-10 rounded-full" aria-label="Color" {@attach tip('Color')}><Palette class="size-4.5" /></Menu.Trigger>
        <Menu.Portal>
            <Menu.Content class="menu flex flex-col gap-3 p-3" side="top" sideOffset={10} collisionPadding={12}>{@render colorItems()}</Menu.Content>
        </Menu.Portal>
    </Menu.Root>
    {#if owned.length}
        <Menu.Root>
            <Menu.Trigger class="icon-button size-10 rounded-full" aria-label="Labels" {@attach tip('Labels')}><Tag class="size-4.5" /></Menu.Trigger>
            <Menu.Portal>
                <Menu.Content class="menu max-h-80 overflow-y-auto" side="top" sideOffset={10} collisionPadding={12}>{@render labelItems()}</Menu.Content>
            </Menu.Portal>
        </Menu.Root>
    {/if}
    {#if attached.length}
        <button class="icon-button size-10 rounded-full" aria-label="Remove reminders" onclick={removeReminders} {@attach tip('Remove reminders')}><BellOff class="size-4.5" /></button>
    {/if}
    {@render actionItems()}
{:else}

{#if onselect}
    <Menu.Item class="menu-item" onSelect={onselect}>
        <SquareCheck class="size-4" />{selected ? 'Deselect' : 'Select'}
    </Menu.Item>
    <Menu.Separator class="menu-separator" />
{/if}

<!-- COLOR -->
<Menu.Sub>
    <Menu.SubTrigger class="menu-item"><Palette class="size-4" />Color<ChevronRight class="ml-auto size-3.5" /></Menu.SubTrigger>
    <Menu.SubContent class="menu flex flex-col gap-3 p-3" sideOffset={6} collisionPadding={12}>{@render colorItems()}</Menu.SubContent>
</Menu.Sub>

<!-- LABELS -->
{#if owned.length}
<Menu.Sub>
    <Menu.SubTrigger class="menu-item"><Tag class="size-4" />Labels<ChevronRight class="ml-auto size-3.5" /></Menu.SubTrigger>
    <Menu.SubContent class="menu max-h-80 overflow-y-auto" sideOffset={6} collisionPadding={12}>{@render labelItems()}</Menu.SubContent>
</Menu.Sub>
{/if}

<!-- REMINDERS | editing needs the open card, so only a single note offers it -->
{#if single && onedit}
    <Menu.Sub>
        <Menu.SubTrigger class="menu-item"><BellPlus class="size-4" />Reminders<ChevronRight class="ml-auto size-3.5" /></Menu.SubTrigger>
        <Menu.SubContent class="menu w-64" sideOffset={6} collisionPadding={12}>
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
            <Menu.Item class="menu-item" onSelect={() => onedit(single, NEW_REMINDER)}><BellPlus class="size-4" />Add reminder</Menu.Item>
            <Menu.Item class="menu-item" onSelect={() => showHistory(single)}><History class="size-4" />History</Menu.Item>
        </Menu.SubContent>
    </Menu.Sub>
{:else if attached.length}
    <Menu.Item class="menu-item" onSelect={removeReminders}><BellOff class="size-4" />Remove reminders</Menu.Item>
{/if}

<Menu.Separator class="menu-separator" />

{@render actionItems()}
{/if}
