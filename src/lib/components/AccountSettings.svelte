<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import ApiKeys from '#lib/components/ApiKeys.svelte';
    import GoogleImport from '#lib/components/GoogleImport.svelte';
    import { androidApp } from '#lib/device_notifications.ts';
    import { unfold } from '#lib/motion.ts';
    import { relock } from '#lib/note_crypto.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { User } from '#lib/schemas/users.ts';
    import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import Input from '#lib/ui/Input.svelte';
    import { Check, KeyRound, PenLine, Server } from '@lucide/svelte';
    import { onMount, untrack } from 'svelte';
    import { changePassword, sendPasswordLink, updateProfile } from '../../routes/api/users.remote';

    // PROPS
    let { user }: { user: User } = $props()

    // PROFILE
    let name = $state(untrack(() => user.name ?? ''))
    let email = $state(untrack(() => user.email))
    let savingProfile = $state(false)
    let profileChanged = $derived(name.trim() !== (user.name ?? '') || email.trim().toLowerCase() !== user.email)

    async function saveProfile() {
        savingProfile = true
        if (await safeAction(updateProfile({ name, email }))) await invalidateAll()
        savingProfile = false
    }

    // The same mail an invite sends, valid for 7 days
    let sendingLink = $state(false)

    async function sendLink() {
        const confirmed = !user.noteLock || await confirmAction({
            title: 'Mail a password link?',
            message: 'A password set through the link makes your locked notes unreadable. Change it here instead to keep them.',
            action: 'Send link'
        })
        if (!confirmed) return

        sendingLink = true
        if (await safeAction(sendPasswordLink(user.id))) notify(`Link sent to ${user.email}.`)
        sendingLink = false
    }

    // PASSWORD CHANGE | locked notes stay readable, their key gets locked again with the new password
    let changing = $state(false)
    let oldPassword = $state('')
    let newPassword = $state('')
    let repeated = $state('')
    let changeError = $state('')
    let savingPassword = $state(false)

    function closeChange() {
        changing = false
        oldPassword = newPassword = repeated = changeError = ''
    }

    async function savePassword() {
        if (newPassword !== repeated) return (changeError = 'The new passwords do not match.')
        savingPassword = true
        changeError = ''

        const noteLock = user.noteLock ? await relock(user.noteLock, oldPassword, newPassword) : null
        if (user.noteLock && !noteLock) changeError = 'The current password is wrong.'
        else if (await safeAction(changePassword({ oldPassword, password: newPassword, noteLock }))) {
            notify('Password changed.')
            closeChange()
            await invalidateAll()
        }
        savingPassword = false
    }

    // SERVER | only the Android app has a server to pick, known after the mount
    let inApp = $state(false)
    onMount(() => { inApp = !!androidApp()?.changeServer })

    async function changeServer() {
        const confirmed = await confirmAction({
            title: 'Change server?',
            message: 'The app restarts and asks for the address. Reminders pause on this phone until you are logged in again.',
            action: 'Change server'
        })
        if (confirmed) androidApp()?.changeServer?.()
    }
</script>

<form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); saveProfile(); }}>
    <dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
        <div class="flex items-baseline justify-between gap-4 bg-card px-card py-2.5">
            <dt><label for="profile-name" class="text-ink-muted">Name</label></dt>
            <dd class="min-w-0 flex-1"><input id="profile-name" bind:value={name} autocomplete="name" required class="type-title w-full bg-transparent py-1.5 text-right text-ink outline-none" /></dd>
        </div>
        <div class="flex items-baseline justify-between gap-4 bg-card px-card py-2.5">
            <dt><label for="profile-email" class="text-ink-muted">Email</label></dt>
            <dd class="min-w-0 flex-1"><input id="profile-email" bind:value={email} type="email" autocomplete="email" required class="w-full bg-transparent py-1.5 text-right text-ink outline-none" /></dd>
        </div>
        <div class="flex items-baseline justify-between gap-4 bg-card px-card py-4">
            <dt class="text-ink-muted">Role</dt>
            <dd class="type-meta rounded-full bg-secondary-soft px-2.5 py-1 text-secondary">{user.authorizationLevel}</dd>
        </div>
        <div class="flex items-center justify-between gap-4 bg-card py-3 pr-3 pl-card">
            <span class="text-ink-muted">Password</span>
            <span class="flex flex-wrap justify-end gap-1">
                <Button type="button" style="ghost" icon={PenLine} onclick={() => (changing ? closeChange() : (changing = true))}>Change</Button>
                <Button type="button" style="ghost" icon={KeyRound} loading={sendingLink} onclick={sendLink}>Mail me a new link</Button>
            </span>
        </div>
        {#if inApp}
            <div class="flex items-center justify-between gap-4 bg-card py-3 pr-3 pl-card">
                <span class="min-w-0 truncate text-ink-muted">Server <span class="text-ink">{page.url.host}</span></span>
                <Button type="button" style="ghost" icon={Server} onclick={changeServer}>Change</Button>
            </div>
        {/if}
    </dl>
    {#if profileChanged}
        <div class="flex justify-end gap-2" transition:unfold>
            <Button type="button" style="ghost" onclick={() => { name = user.name ?? ''; email = user.email; }}>Undo</Button>
            <Button type="submit" icon={Check} loading={savingProfile}>Save</Button>
        </div>
    {/if}
</form>

{#if changing}
    <form class="grid gap-3" transition:unfold onsubmit={(event) => { event.preventDefault(); savePassword(); }}>
        <input type="text" name="username" autocomplete="username" value={user.email} hidden readonly />
        <Input id="password-old" label="Current password" type="password" autocomplete="current-password" required bind:value={oldPassword} />
        <Input id="password-new" label="New password, at least 8 characters" type="password" autocomplete="new-password" minlength={8} required bind:value={newPassword} />
        <Input id="password-repeat" label="Repeat new password" type="password" autocomplete="new-password" required bind:value={repeated} />
        {#if changeError}<p class="text-sm text-accent" role="alert">{changeError}</p>{/if}
        <div class="flex justify-end gap-2">
            <Button type="button" style="ghost" onclick={closeChange}>Cancel</Button>
            <Button type="submit" icon={Check} loading={savingPassword}>Change password</Button>
        </div>
    </form>
{/if}

{#if page.data.limits.aiAccess}
    <ApiKeys />
{/if}

<GoogleImport />
