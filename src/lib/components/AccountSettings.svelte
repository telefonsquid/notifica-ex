<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import ApiKeys from '#lib/components/ApiKeys.svelte';
    import GoogleImport from '#lib/components/GoogleImport.svelte';
    import { androidApp } from '#lib/device_notifications.ts';
    import { unfold } from '#lib/motion.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { User } from '#lib/schemas/users.ts';
    import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import { Check, KeyRound, Server } from '@lucide/svelte';
    import { onMount, untrack } from 'svelte';
    import { sendPasswordLink, updateProfile } from '../../routes/api/users.remote';

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
        sendingLink = true
        if (await safeAction(sendPasswordLink(user.id))) notify(`Link sent to ${user.email}.`)
        sendingLink = false
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
            <Button type="button" style="ghost" icon={KeyRound} loading={sendingLink} onclick={sendLink}>Mail me a new link</Button>
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

{#if page.data.limits.aiAccess}
    <ApiKeys />
{/if}

<GoogleImport />
