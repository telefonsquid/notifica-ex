<script lang="ts">
    import AutoColorToggle from '#lib/components/AutoColorToggle.svelte';
    import ColorPicker from '#lib/components/ColorPicker.svelte';
    import { deleteLabelEverywhere } from '#lib/deletions.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { Label } from '#lib/schemas/notes.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import InlineInput from '#lib/ui/InlineInput.svelte';
    import { Trash2 } from '@lucide/svelte';
    import type { ClassValue } from 'svelte/elements';
    import { updateLabel } from '../../routes/api/labels.remote';

    // Everything that can change about a label, laid out by whoever holds it

    // PROPS
    let {
        label,
        class: inputClass = '',
        focus = false,
        onremove = () => deleteLabelEverywhere(label)
    }: {
        label: Label
        class?: ClassValue              // For the name field
        focus?: boolean
        onremove?: () => void
    } = $props()
</script>

<ColorPicker value={label.color} onpick={(color) => safeAction(updateLabel({ id: label.id, color }))} label={`Color of ${label.name}`} />
<!-- Focus comes before a popover is placed and would jump the page -->
<InlineInput
    value={label.name}
    label={`Rename ${label.name}`}
    maxlength={LIMITS.LABEL_NAME}
    class={['flex-1', inputClass]}
    onsave={(name) => safeAction(updateLabel({ id: label.id, name }))}
    {@attach focus ? (node) => node.focus({ preventScroll: true }) : null}
/>
<AutoColorToggle {label} />
<button class="icon-button" aria-label={`Delete ${label.name}`} onclick={onremove} {@attach tip('Delete label')}>
    <Trash2 class="size-4" />
</button>
