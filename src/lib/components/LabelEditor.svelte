<script lang="ts">
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import { deleteLabelEverywhere } from '#lib/deletions.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { Label } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Trash2 } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import type { ClassValue } from 'svelte/elements';
    import { updateLabel } from '../../routes/api/labels.remote';

    // PROPS
    let {
        label,
        open = $bindable(false),
        ondelete,
        class: className = ''
    }: {
        label: Label
        open?: boolean                  // the tab's right click menu opens it too
        ondelete?: () => void           // the label is gone from every note, the open one drops it too
        class?: ClassValue
    } = $props()

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
        open = false
        if(await deleteLabelEverywhere(label)) ondelete?.()
    }
</script>

<!-- The tab's name opens it, changes apply to the label on every note -->
<Popover.Root bind:open>
    <Popover.Trigger class={['truncate text-left uppercase hover:underline', className]} aria-label={`Edit label ${label.name}`}>
        {label.name}
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            class="popover z-[60] flex w-64 items-center gap-2 rounded-card border border-line-strong bg-raised p-2 text-ink shadow-2xl"
        >
            <ColorPicker value={label.color} onpick={(color) => safeAction(updateLabel({ id: label.id, color }))} label={`Color of ${label.name}`} class="ml-1" />
            <input
                value={label.name}
                maxlength={LIMITS.LABEL_NAME}
                aria-label="Label name"
                class="min-w-0 flex-1 rounded-control bg-card px-3 py-2 text-sm outline-none"
                onchange={(event) => rename(event.currentTarget)}
                onkeydown={(event) => { if(event.key === 'Enter') event.currentTarget.blur() }}
                {@attach (node) => node.focus({ preventScroll: true })}     // focus comes before the popover is placed and would jump the page
            />
            <button class="icon-button" aria-label={`Delete ${label.name}`} onclick={remove} {@attach tip('Delete label')}>
                <Trash2 class="size-4" />
            </button>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>
