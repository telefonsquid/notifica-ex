<script lang="ts">
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import { safeAction } from '#lib/pocketbase.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { Label } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Trash2 } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import type { ClassValue } from 'svelte/elements';
    import { deleteLabel, updateLabel } from '../../routes/api/labels.remote';

    // PROPS
    let {
        label,
        ondelete,
        class: className = ''
    }: {
        label: Label
        ondelete?: () => void           // the label is gone from every note, the open one drops it too
        class?: ClassValue
    } = $props()

    let confirmDelete = $state(false)

    // Renames on Enter or leaving the field, an empty name goes back to the old one
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
        if(await safeAction(deleteLabel(label.id))) ondelete?.()
        confirmDelete = false
    }
</script>

<!-- The tab's name opens it, changes apply to the label on every note -->
<Popover.Root onOpenChange={(open) => { if(!open) confirmDelete = false }}>
    <Popover.Trigger class={['truncate text-left uppercase hover:underline', className]} aria-label={`Edit label ${label.name}`}>
        {label.name}
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            class="label-editor z-[60] flex w-64 items-center gap-2 rounded-card border border-line-strong bg-raised p-2 text-ink shadow-2xl"
        >
            <ColorPicker value={label.color} onpick={(color) => safeAction(updateLabel({ id: label.id, color }))} label={`Color of ${label.name}`} class="ml-1" />
            <input
                value={label.name}
                maxlength={LIMITS.LABEL_NAME}
                aria-label="Label name"
                class="min-w-0 flex-1 rounded-control bg-card px-3 py-2 text-sm outline-none"
                onchange={(event) => rename(event.currentTarget)}
                onkeydown={(event) => { if(event.key === 'Enter') event.currentTarget.blur() }}
                {@attach (node) => node.focus()}
            />
            <button
                class={['icon-button', confirmDelete && 'bg-accent text-on-accent hover:text-on-accent']}
                aria-label={confirmDelete ? `Confirm deleting ${label.name}` : `Delete ${label.name}`}
                onclick={remove}
                onblur={() => confirmDelete = false}
                {@attach tip(confirmDelete ? 'Click again to delete it from every note' : 'Delete label')}
            >
                <Trash2 class="size-4" />
            </button>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    :global(.label-editor[data-state='open']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: label-editor-in var(--duration-base) var(--ease-spring);
    }

    :global(.label-editor[data-state='closed']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: label-editor-in var(--duration-fast) var(--ease-in) reverse forwards;
    }

    @keyframes label-editor-in {
        from { opacity: 0; scale: 0.92; }
    }
</style>
