<script lang="ts">
    import { duration, easing, rise, sink } from '#lib/motion.ts';
    import { confirmation, settleConfirmation } from '#lib/singletons/confirm.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import { TriangleAlert } from '@lucide/svelte';
    import { Dialog } from 'bits-ui';
    import { fade } from 'svelte/transition';

    // Asks before something can't be undone, mounted once in the root layout. Opens with confirmAction().
</script>

<Dialog.Root open={confirmation.open} onOpenChange={(open) => { if(!open) settleConfirmation(false) }}>
    <Dialog.Portal>
        <Dialog.Overlay forceMount>
            {#snippet child({ props, open })}
                {#if open}
                    <div {...props} class="scrim fixed inset-0 z-[90]" transition:fade={{ duration: duration('base'), easing: easing('out') }}></div>
                {/if}
            {/snippet}
        </Dialog.Overlay>
        <Dialog.Content forceMount onOpenAutoFocus={(event) => event.preventDefault()}>
            {#snippet child({ props, open })}
                {#if open && confirmation.request}
                    {@const request = confirmation.request}
                    <div {...props} class="fixed inset-0 z-[91] grid place-items-center p-gutter outline-none" onclick={(event) => { if(event.target === event.currentTarget) settleConfirmation(false) }}>
                        <div class="w-full max-w-sm rounded-card border border-line-strong bg-raised p-card text-ink shadow-2xl" in:rise={{ duration: 'base', easing: 'spring' }} out:sink>
                            <div class="flex items-start gap-3">
                                <span class="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><TriangleAlert class="size-4.5" /></span>
                                <div class="grid gap-1.5 pt-1">
                                    <Dialog.Title class="type-title text-lg">{request.title}</Dialog.Title>
                                    <Dialog.Description class="text-sm text-ink-muted">{request.message}</Dialog.Description>
                                </div>
                            </div>
                            <div class="mt-6 flex justify-end gap-2">
                                <Button style="ghost" onclick={() => settleConfirmation(false)}>Cancel</Button>
                                <Button onclick={() => settleConfirmation(true)} {@attach (node) => node.focus()}>{request.action}</Button>
                            </div>
                        </div>
                    </div>
                {/if}
            {/snippet}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    .scrim {
        background: rgb(0 0 0 / 0.4);
    }
</style>
