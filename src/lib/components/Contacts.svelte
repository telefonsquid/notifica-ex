<script lang="ts">
    import { page } from '$app/state';
    import { resolve } from '$app/paths';
    import { unfold } from '#lib/motion.ts';
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { InviteSummary } from '#lib/schemas/contacts.ts';
    import type { Person } from '#lib/schemas/notes.ts';
    import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
    import { formatDay } from '#lib/time_format.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import { Copy, Link, Trash2, UserMinus, X } from '@lucide/svelte';
    import { createInviteLink, deleteContact, getContacts, getInvites, revokeInviteLink } from '../../routes/api/contacts.remote';

    // People this account can share notes with, and the links that add more

    // DATA
    let [contacts, invites] = $derived(await Promise.all([getContacts(), getInvites()]))

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

    // NEW LINK
    let creating = $state(false)
    let fresh = $state<string | null>(null)     // Shown until dismissed, the server keeps only its hash

    async function create() {
        creating = true
        const created = await safeAction(createInviteLink())
        creating = false
        if(created) fresh = page.url.origin + resolve('/invite/[token]', { token: created.token })
    }

    async function revoke(invite: InviteSummary) {
        const confirmed = await confirmAction({
            title: 'Revoke this invite link?',
            message: 'Whoever has the link can no longer use it.',
            action: 'Revoke'
        })
        if(confirmed) await safeAction(revokeInviteLink(invite.id))
    }

    async function remove(person: Person) {
        const confirmed = await confirmAction({
            title: `Remove ${person.name}?`,
            message: 'You both stop seeing each other when sharing. Notes already shared stay shared.',
            action: 'Remove'
        })
        if(confirmed) await safeAction(deleteContact(person.id))
    }

    async function copy(text: string) {
        await navigator.clipboard.writeText(text)
        notify('Copied.')
    }
</script>

<div class="grid gap-4">
    <h3 class="type-meta text-ink-faint">Contacts</h3>

    {#if contacts.length || invites.length}
        <dl class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
            {#each contacts as person (person.id)}
                <div class="flex items-center gap-3 bg-card py-3 pr-3 pl-card" transition:unfold>
                    <span class="avatar type-meta grid size-6 shrink-0 place-items-center rounded-full bg-secondary-soft text-ink">{person.name.slice(0, 1).toUpperCase()}</span>
                    <span class="min-w-0 flex-1 truncate text-ink">{person.name}</span>
                    <button type="button" class="icon-button" aria-label="Remove {person.name}" onclick={() => remove(person)} {@attach tip('Remove contact')}><UserMinus class="size-4" /></button>
                </div>
            {/each}

            {#each invites as invite (invite.id)}
                <div class="flex items-center gap-3 bg-card py-3 pr-3 pl-card" transition:unfold>
                    <Link class="size-4 shrink-0 text-ink-faint" />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-ink-muted">Open invite link</span>
                        <span class="type-meta block text-ink-faint">Expires {formatDay(invite.expires, zone, Date.now())}</span>
                    </span>
                    <button type="button" class="icon-button" aria-label="Revoke invite link" onclick={() => revoke(invite)} {@attach tip('Revoke')}><Trash2 class="size-4" /></button>
                </div>
            {/each}
        </dl>
    {:else}
        <p class="text-ink-muted">Notes can be shared with contacts. Send someone an invite link to connect.</p>
    {/if}

    {#if fresh}
        <div class="grid gap-3 rounded-card border border-accent bg-card p-card" transition:unfold>
            <div class="flex items-start justify-between gap-3">
                <p class="text-ink">Copy the link now, it won't show again. It works once, for a week.</p>
                <button type="button" class="icon-button" aria-label="Close" onclick={() => (fresh = null)}><X class="size-4" /></button>
            </div>
            <div class="flex items-center gap-2 rounded-control bg-raised py-2 pr-2 pl-4">
                <code class="min-w-0 flex-1 break-all text-ink">{fresh}</code>
                <button type="button" class="icon-button" aria-label="Copy link" onclick={() => copy(fresh ?? '')} {@attach tip('Copy link')}><Copy class="size-4" /></button>
            </div>
        </div>
    {/if}

    {#if invites.length < LIMITS.INVITES}
        <div class="flex justify-center sm:justify-end">
            <Button type="button" icon={Link} loading={creating} onclick={create}>New invite link</Button>
        </div>
    {/if}
</div>
