<script lang="ts">
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import { safeAction } from '#lib/pocketbase.ts';
    import type { Label } from '#lib/schemas.ts';
    import { Check, Pencil, Trash2 } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import { deleteLabel, updateLabel } from '../../routes/api/labels.remote';

    // PROPS
    let {
        label,
        active,
        ontoggle,
        ondelete
    }: {
        label: Label
        active: boolean                 // carried by the note in the editor
        ontoggle: () => void
        ondelete: () => void            // lets the editor drop the label from its draft
    } = $props()

    let confirmDelete = $state(false)

    function rename(input: HTMLInputElement){
        const name = input.value.trim()
        if(!name || name === label.name){
            input.value = label.name
            return
        }
        safeAction(updateLabel({ id: label.id, name })).then((result) => {
            if(!result) input.value = label.name
        })
    }

    async function remove(){
        if(!confirmDelete){
            confirmDelete = true
            return
        }
        if(await safeAction(deleteLabel(label.id))) ondelete()
        confirmDelete = false
    }
</script>

<div class={['label-chip motion-interactive flex items-center rounded-full border', active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-faint hover:text-ink-muted']}>
    <button class="type-meta flex items-center gap-1 py-1 pr-1.5 pl-2.5" aria-pressed={active} onclick={ontoggle}>
        <span class="note-mark h-1.5 w-3 rounded-full" data-note={label.color || undefined}></span>
        {label.name}{#if active}<Check class="size-3" />{/if}
    </button>

    <!-- EDIT | changes the label itself, so every note carrying it follows -->
    <Popover.Root onOpenChange={(open) => { if(!open) confirmDelete = false }}>
        <Popover.Trigger class="edit grid h-5 place-items-center overflow-hidden rounded-full hover:bg-line hover:text-ink" aria-label={`Edit label ${label.name}`}>
            <Pencil class="size-3 shrink-0" />
        </Popover.Trigger>
        <Popover.Portal>
            <Popover.Content
                sideOffset={8}
                collisionPadding={12}
                class="label-editor z-[60] grid w-72 gap-3 rounded-card border border-line-strong bg-raised p-3 text-ink shadow-2xl"
            >
                <div class="flex items-center gap-3 pl-1">
                    <ColorPicker value={label.color} onpick={(color) => safeAction(updateLabel({ id: label.id, color }))} label={`Color of ${label.name}`} />
                    <input
                        value={label.name}
                        aria-label={`Rename ${label.name}`}
                        class="min-w-0 flex-1 rounded-control border border-line bg-card px-3 py-2 text-ink outline-none focus:border-accent"
                        onchange={(event) => rename(event.currentTarget)}
                        onkeydown={(event) => { if(event.key === 'Enter') event.currentTarget.blur() }}
                    />
                </div>
                <div class="flex items-center justify-between gap-3 pl-1">
                    <p class="type-meta text-ink-faint">Applies to every note</p>
                    <button
                        class={['type-meta motion-interactive flex items-center gap-1.5 rounded-full px-2.5 py-1.5', confirmDelete ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-line hover:text-ink']}
                        onclick={remove}
                        onblur={() => confirmDelete = false}
                    >
                        <Trash2 class="size-3.5" /> {confirmDelete ? 'Really delete' : 'Delete'}
                    </button>
                </div>
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
</div>

<style>
    /* EDIT BUTTON | tucked away until the chip is hovered, devices without hover always show it */
    :global(.label-chip .edit) {
        width: 1.25rem;
        margin-right: 0.25rem;
        transition:
            width var(--duration-base) var(--ease-spring),
            margin var(--duration-base) var(--ease-spring),
            opacity var(--duration-fast) var(--ease-out);
    }

    @media (hover: hover) {
        :global(.label-chip:not(:hover, :focus-within) .edit:not([data-state='open'])) {
            width: 0;
            margin-right: 0;
            opacity: 0;
        }
    }

    /* Grows out of the pencil that opened it */
    :global(.label-editor[data-state='open']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: editor-in var(--duration-base) var(--ease-spring);
    }

    :global(.label-editor[data-state='closed']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: editor-in var(--duration-fast) var(--ease-in) reverse forwards;
    }

    @keyframes editor-in {
        from { opacity: 0; scale: 0.9; }
    }
</style>
