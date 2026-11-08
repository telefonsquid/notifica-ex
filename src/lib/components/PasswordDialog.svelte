<script lang="ts">
    import { page } from '$app/state';
    import { duration, easing, rise, sink } from '#lib/motion.ts';
    import { passwordPrompt, settlePassword } from '#lib/singletons/password.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import Input from '#lib/ui/Input.svelte';
    import { LockKeyhole } from '@lucide/svelte';
    import { Dialog } from 'bits-ui';
    import { fade } from 'svelte/transition';

    // Asks for the account password, mounted once in the root layout. Opens with askPassword().

    let password = $state('')
    let problem = $state('')
    let checking = $state(false)

    // Every opening starts empty
    $effect.pre(() => {
        if(!passwordPrompt.open) return
        password = ''
        problem = ''
        checking = false
    })

    async function submit(event: SubmitEvent) {
        event.preventDefault()
        const request = passwordPrompt.request
        if(!request || !password || checking) return

        checking = true
        const answer = await request.check(password).catch(() => 'Something went wrong, try again.')
        checking = false
        if(answer === null) settlePassword(true)
        else problem = answer
    }
</script>

<Dialog.Root open={passwordPrompt.open} onOpenChange={(open) => { if(!open && !checking) settlePassword(false) }}>
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
                {#if open && passwordPrompt.request}
                    {@const request = passwordPrompt.request}
                    <div {...props} class="fixed inset-0 z-[91] grid place-items-center p-gutter outline-none" onclick={(event) => { if(event.target === event.currentTarget && !checking) settlePassword(false) }}>
                        <form class="w-full max-w-sm rounded-card border border-line-strong bg-raised p-card text-ink shadow-2xl" onsubmit={submit} in:rise={{ duration: 'base', easing: 'spring' }} out:sink>
                            <div class="flex items-start gap-3">
                                <span class="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><LockKeyhole class="size-4.5" /></span>
                                <div class="grid gap-1.5 pt-1">
                                    <Dialog.Title class="type-title text-lg">{request.title}</Dialog.Title>
                                    <Dialog.Description class="text-sm text-ink-muted">{request.message}</Dialog.Description>
                                </div>
                            </div>

                            <!-- The username field lets password managers fill the right entry -->
                            <input type="text" name="username" autocomplete="username" value={page.data.user?.email ?? ''} hidden />
                            <div class="mt-5 grid gap-2">
                                <Input id="note-lock-password" label="Account password" type="password" autocomplete="current-password" bind:value={password} disabled={checking} {@attach (node) => node.querySelector('input')?.focus()} />
                                {#if problem}<p class="text-sm text-accent" role="alert">{problem}</p>{/if}
                            </div>

                            <div class="mt-6 flex justify-end gap-2">
                                <Button type="button" style="ghost" disabled={checking} onclick={() => settlePassword(false)}>Cancel</Button>
                                <Button type="submit" loading={checking} disabled={!password}>{request.action}</Button>
                            </div>
                        </form>
                    </div>
                {/if}
            {/snippet}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
