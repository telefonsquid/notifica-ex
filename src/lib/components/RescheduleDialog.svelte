<script lang="ts">
    import { duration, easing, rise, sink } from '#lib/motion.ts';
    import { snoozeUntil } from '#lib/reminders.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { toLocalInput } from '#lib/time_format.ts';
    import Button from '#lib/ui/Button.svelte';
    import { Dialog } from 'bits-ui';
    import { fade } from 'svelte/transition';
    import { rescheduleOccurrence } from '../../routes/api/reminders.remote';

    // The choices behind the Android notification's Reschedule button, for one occurrence
    let {
        occurrence,
        title,
        onclose,
    }: {
        occurrence: string | null
        title: string
        onclose: () => void
    } = $props()

    const HOUR = 60 * 60 * 1000
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

    let custom = $state(toLocalInput(new Date(Date.now() + HOUR)).slice(0, 14) + '00')
    let saving = $state(false)

    const choices = [
        { label: '1 hour', at: () => new Date(Date.now() + HOUR) },
        { label: '3 hours', at: () => new Date(Date.now() + 3 * HOUR) },
        { label: 'Tomorrow 9:00', at: () => snoozeUntil('tomorrow', new Date(), zone) },
    ]

    async function pick(at: Date){
        if(!occurrence || isNaN(at.getTime())) return
        saving = true
        const done = await safeAction(rescheduleOccurrence({ id: occurrence, at: at.toISOString() }))
        saving = false
        if(done) onclose()
    }
</script>

<Dialog.Root open={!!occurrence} onOpenChange={(open) => { if(!open) onclose() }}>
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
                {#if open}
                    <div {...props} class="fixed inset-0 z-[91] grid place-items-center p-gutter outline-none" onclick={(event) => { if(event.target === event.currentTarget) onclose() }}>
                        <div class="grid w-full max-w-sm gap-4 rounded-card border border-line-strong bg-raised p-card text-ink shadow-2xl" in:rise={{ duration: 'base', easing: 'spring' }} out:sink>
                            <Dialog.Title class="type-title truncate text-lg">{title}</Dialog.Title>
                            <div class="grid grid-cols-3 gap-2">
                                {#each choices as choice (choice.label)}
                                    <Button style="secondary" class="justify-center" disabled={saving} onclick={() => pick(choice.at())}>{choice.label}</Button>
                                {/each}
                            </div>
                            <form class="flex gap-2" onsubmit={(event) => { event.preventDefault(); pick(new Date(custom)) }}>
                                <input type="datetime-local" bind:value={custom} aria-label="Other time" class="field min-w-0 flex-1" />
                                <Button type="submit" loading={saving}>Set</Button>
                            </form>
                        </div>
                    </div>
                {/if}
            {/snippet}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
