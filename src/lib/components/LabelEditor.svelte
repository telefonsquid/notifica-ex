<script lang="ts">
    import LabelFields from '#lib/components/LabelFields.svelte';
    import { deleteLabelEverywhere } from '#lib/deletions.ts';
    import type { Label } from '#lib/schemas/notes.ts';
    import { Popover } from 'bits-ui';

    // PROPS
    let {
        label,
        anchor,
        open = $bindable(false),
        ondelete
    }: {
        label: Label
        anchor: HTMLElement | undefined     // the tab it hangs from
        open?: boolean                      // the tab's menus open it
        ondelete?: () => void               // the label is gone from every note, the open one drops it too
    } = $props()

    async function remove(){
        open = false
        if(await deleteLabelEverywhere(label)) ondelete?.()
    }
</script>

<!-- Changes apply to the label on every note -->
<Popover.Root bind:open>
    <Popover.Portal>
        <Popover.Content
            customAnchor={anchor}
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            class="popover z-[60] flex w-64 items-center gap-2 rounded-card border border-line-strong bg-raised p-2 pl-3 text-ink shadow-2xl"
        >
            <LabelFields {label} class="rounded-control bg-card px-3 py-2 text-sm" focus onremove={remove} />
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>
