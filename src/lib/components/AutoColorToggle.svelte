<script lang="ts">
    import { safeAction } from '#lib/pocketbase.ts';
    import type { Label } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { PaintBucket } from '@lucide/svelte';
    import { updateLabel } from '../../routes/api/labels.remote';

    // PROPS
    let { label }: { label: Label } = $props()
</script>

<button
    class={['icon-button', label.autoColor && 'bg-accent-soft text-ink']}
    aria-label={`Auto color notes with ${label.name}`}
    aria-pressed={label.autoColor}
    {@attach tip(label.autoColor ? 'Colors its notes' : 'Color its notes')}
    onclick={() => safeAction(updateLabel({ id: label.id, autoColor: !label.autoColor }))}
>
    <PaintBucket class="size-4" />
</button>
