<script lang="ts">
    import { page } from '$app/state';
    import { unfold } from '#lib/motion.ts';
    import { lockForPasskey } from '#lib/note_crypto.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { createPasskey, passkeyProblem, passkeysAvailable, passkeySecret } from '#lib/passkeys.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { PasskeySummary } from '#lib/schemas/passkeys.ts';
    import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
    import { askPassword } from '#lib/singletons/password.svelte.ts';
    import { formatDay } from '#lib/time_format.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import { LockKeyholeOpen, Plus, Trash2 } from '@lucide/svelte';
    import { onMount } from 'svelte';
    import { addPasskey, getPasskeys, removePasskey, setPasskeyNoteKey, startPasskey } from '../../routes/api/passkeys.remote';

    // Sign in without the password, and open locked notes where the device can

    // DATA
    let passkeys = $derived(await getPasskeys())

    const lock = $derived(page.data.user?.noteLock)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

    let supported = $state(true)
    onMount(() => {
        supported = passkeysAvailable()
    })

    function opensNotes(passkey: PasskeySummary) {
        return !!lock && passkey.noteKey?.id === lock.id
    }

    // NEW PASSKEY
    let name = $state('')

    async function add() {
        const added = await askPassword({
            title: 'Add passkey',
            message: 'Your account password confirms it is you.',
            action: 'Continue',
            check: async (password) => {
                try {
                    const made = await createPasskey(await startPasskey({ password }))
                    if(!made) return 'No passkey was made.'

                    const passkey = await addPasskey({ name, prf: made.prf, creation: made.creation })
                    if(made.prf) await unlockWith(passkey, password, made.secret).catch(() => {}) // Stays a way to sign in
                    return null
                } catch (err) {
                    return passkeyProblem(err)
                }
            }
        })
        if(added) name = ''
    }

    async function remove(passkey: PasskeySummary) {
        const confirmed = await confirmAction({
            title: `Remove ${passkey.name}?`,
            message: 'It no longer signs you in. Your device may keep showing it until you delete it there too.',
            action: 'Remove'
        })
        if(confirmed) await safeAction(removePasskey(passkey.id))
    }

    // LOCKED NOTES
    // False when cancelled | throws what went wrong
    async function unlockWith(passkey: PasskeySummary, password: string, secret: Uint8Array<ArrayBuffer> | null = null) {
        if(!lock) return false
        secret ??= (await passkeySecret([passkey]))?.secret ?? null
        const noteKey = secret && await lockForPasskey(lock, password, secret)
        if(!noteKey) return false
        await setPasskeyNoteKey({ id: passkey.id, noteKey })
        return true
    }

    async function useForNotes(passkey: PasskeySummary) {
        const done = await askPassword({
            title: 'Open locked notes',
            message: `Confirm with your account password, then ${passkey.name} opens your locked notes.`,
            action: 'Continue',
            check: async (password) => {
                try {
                    return await unlockWith(passkey, password) ? null : 'That did not work, check the password.'
                } catch (err) {
                    return passkeyProblem(err)
                }
            }
        })
        if(done) notify(`${passkey.name} opens locked notes now.`)
    }

    // LABELS
    function details(passkey: PasskeySummary) {
        const now = Date.now()
        return [
            opensNotes(passkey) ? 'opens locked notes' : null,
            passkey.lastUsed ? `used ${formatDay(passkey.lastUsed, zone, now).toLowerCase()}` : 'never used'
        ].filter(Boolean).join(' · ')
    }
</script>

{#if supported || passkeys.length}
    <div class="grid gap-4">
        <h3 class="type-meta text-ink-faint">Passkeys</h3>

        {#if passkeys.length}
            <dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line" transition:unfold>
                {#each passkeys as passkey (passkey.id)}
                    <div class="flex items-center gap-4 bg-card py-3 pr-3 pl-card" transition:unfold>
                        <span class="min-w-0 flex-1">
                            <span class="type-title block truncate text-ink">{passkey.name}</span>
                            <span class="type-meta block text-ink-faint">{details(passkey)}</span>
                        </span>
                        {#if supported && lock && passkey.prf && !opensNotes(passkey)}
                            <button type="button" class="icon-button" aria-label="Open locked notes with {passkey.name}" onclick={() => useForNotes(passkey)} {@attach tip('Open locked notes with it')}><LockKeyholeOpen class="size-4" /></button>
                        {/if}
                        <button type="button" class="icon-button" aria-label="Remove {passkey.name}" onclick={() => remove(passkey)} {@attach tip('Remove')}><Trash2 class="size-4" /></button>
                    </div>
                {/each}
            </dl>
        {/if}

        {#if supported && passkeys.length < LIMITS.PASSKEYS}
            <form class="flex flex-wrap items-center gap-3" onsubmit={(event) => { event.preventDefault(); add(); }}>
                <div class="flex flex-1 basis-64 items-baseline justify-between gap-4 rounded-card border border-line bg-card px-card py-2.5">
                    <label for="passkey-name" class="text-ink-muted">Name</label>
                    <input id="passkey-name" bind:value={name} maxlength={LIMITS.PASSKEY_NAME} placeholder="My laptop" required class="min-w-0 flex-1 bg-transparent py-1.5 text-right text-ink outline-none placeholder:text-ink-faint" />
                </div>
                <div class="flex justify-center max-sm:basis-full">
                    <Button type="submit" icon={Plus} disabled={!name.trim()}>New passkey</Button>
                </div>
            </form>
        {/if}
    </div>
{/if}
