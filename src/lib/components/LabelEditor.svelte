<script lang="ts">
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import { safeAction } from '#lib/pocketbase.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { Label } from '#lib/schemas.ts';
    import ConfirmButton from '#lib/ui/ConfirmButton.svelte';
    import InlineInput from '#lib/ui/InlineInput.svelte';
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

    async function remove(){
        if(await safeAction(deleteLabel(label.id))) ondelete?.()
    }
</script>

<!-- The tab's name opens it, changes apply to the label on every note -->
<Popover.Root>
    <Popover.Trigger class={['truncate text-left hover:underline', className]} aria-label={`Edit label ${label.name}`}>
        {label.name}
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            class="popover z-[60] flex w-64 items-center gap-2 p-2"
        >
            <ColorPicker value={label.color} onpick={(color) => safeAction(updateLabel({ id: label.id, color }))} label={`Color of ${label.name}`} class="ml-1" />
            <InlineInput
                value={label.name}
                label="Label name"
                maxlength={LIMITS.LABEL_NAME}
                class="flex-1 rounded-control bg-card px-3 py-2 text-sm"
                onsave={(name) => safeAction(updateLabel({ id: label.id, name }))}
                {@attach (node) => node.focus()}
            />
            <ConfirmButton
                icon={Trash2}
                label={`Delete ${label.name}`}
                confirmLabel={`Confirm deleting ${label.name}`}
                hint="Delete label"
                confirmHint="Click again to delete it from every note"
                onconfirm={remove}
            />
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

