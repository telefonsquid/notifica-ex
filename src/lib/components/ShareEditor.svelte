<script lang="ts">
    import Faces from '#lib/components/Faces.svelte';
    import { notify } from '#lib/notifications.svelte.ts';
    import type { NoteLinkMode, Person } from '#lib/schemas/notes.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Choice from '#lib/ui/Choice.svelte';
    import { Check, Copy, RefreshCw, UserPlus, X } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import { getNoteLink } from '../../routes/api/links.remote';

    // Anyone holding the link sees the note, signed in people find it in their grid
    type Link = {
        id: string                      // empty until the note is stored
        mode: NoteLinkMode
        linked: Person[]                // who joined through it
        onmode: (mode: NoteLinkMode, renew?: boolean) => void
        onremove: (person: string) => void
    }

    // PROPS | every pick hands back the whole new list
    let {
        people,
        shared,
        faces = [],
        link,
        class: className = '',
        onchange
    }: {
        people: Person[]                // everyone but the owner
        shared: string[]
        faces?: Person[]                // who it's shared with, they stand in for the share icon
        link?: Link                     // only the owner manages it
        class?: string
        onchange: (shared: string[]) => void
    } = $props()

    let label = $derived(faces.length ? `Shared with ${faces.map((person) => person.name).join(', ')}` : 'Share')

    let query = $state('')
    let picks = $derived(people.filter((person) => !person.viaLink))     // People known only through a link can't be picked
    let matches = $derived(picks.filter((person) => person.name.toLowerCase().includes(query.trim().toLowerCase())))

    // LINK
    const MODES: { value: NoteLinkMode, label: string }[][] = [[{ value: '', label: 'No link' }], [{ value: 'read', label: 'Anyone can view' }, { value: 'write', label: 'Anyone can edit' }]]

    let open = $state(false)
    let address = $derived(open && link?.id && link.mode ? getNoteLink(link.id) : null)

    async function copy(){
        const token = address?.current?.token
        if(!token) return
        await navigator.clipboard.writeText(`${location.origin}/n/${token}`)
        notify('Link copied.')
    }

    function toggle(id: string){
        onchange(shared.includes(id) ? shared.filter((item) => item !== id) : [...shared, id])
    }
</script>

<!-- Stays open after a pick, so several people join in one go -->
<Popover.Root bind:open onOpenChange={(open) => { if(!open) query = '' }}>
    <Popover.Trigger class={[faces.length ? 'faces-button' : 'icon-button', className]} aria-label={label} {@attach tip(label)}>
        {#if faces.length}<Faces people={faces} />{:else}<UserPlus class="size-4" />{/if}
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            class="popover z-[60] flex max-h-80 w-64 flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl"
        >
            {#if picks.length > 6}
                <div class="border-b border-line p-2">
                    <input bind:value={query} placeholder="Find someone" aria-label="Name" class="w-full rounded-control bg-card px-3 py-2 text-sm outline-none" {@attach (node) => node.focus()} />
                </div>
            {/if}

            <ul class="min-h-0 overflow-y-auto p-1.5">
                {#each matches as person (person.id)}
                    {@const picked = shared.includes(person.id)}
                    <li>
                        <button class={['motion-interactive flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-sm hover:bg-line', picked ? 'text-ink' : 'text-ink-muted']} aria-pressed={picked} onclick={() => toggle(person.id)}>
                            <span class="avatar type-meta grid size-6 shrink-0 place-items-center rounded-full bg-secondary-soft text-ink">{person.name.slice(0, 1).toUpperCase()}</span>
                            <span class="min-w-0 flex-1 truncate text-left">{person.name}</span>
                            {#if picked}<Check class="size-4 text-accent" strokeWidth={2.5} />{/if}
                        </button>
                    </li>
                {:else}
                    <li class="type-meta px-2.5 py-2 text-ink-faint">{picks.length ? 'Nobody by that name' : 'No contacts yet, invite someone in Settings'}</li>
                {/each}
            </ul>

            <!-- LINK | the same link all along, until a new one stops it -->
            {#if link}
                <div class="grid gap-2 border-t border-line p-2">
                    <div class="flex items-center gap-1">
                        <Choice class="min-w-0 flex-1" label="Link" value={link.mode} groups={MODES} onchange={(mode) => link.onmode(mode)} />
                        {#if link.mode}
                            <button class="icon-button" aria-label="Copy link" disabled={!address?.current?.token} onclick={copy} {@attach tip('Copy link')}><Copy class="size-4" /></button>
                            <button class="icon-button" aria-label="New link" onclick={() => link.onmode(link.mode, true)} {@attach tip('New link, the old one stops working')}><RefreshCw class="size-4" /></button>
                        {/if}
                    </div>
                    {#if link.linked.length}
                        <ul class="grid">
                            {#each link.linked as person (person.id)}
                                <li class="flex items-center gap-2.5 py-1 pl-2.5 text-sm text-ink-muted">
                                    <span class="avatar type-meta grid size-6 shrink-0 place-items-center rounded-full bg-secondary-soft text-ink">{person.name.slice(0, 1).toUpperCase()}</span>
                                    <span class="min-w-0 flex-1 truncate">{person.name}</span>
                                    <button class="icon-button" aria-label={`Remove ${person.name}`} onclick={() => link.onremove(person.id)} {@attach tip('Remove')}><X class="size-4" /></button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            {/if}
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    /* As tall as an icon button, so the row keeps its height | round around one face */
    :global(.faces-button) {
        display: grid;
        place-items: center;
        height: 2rem;
        min-width: 2rem;
        padding: 0.25rem;
        border-radius: 9999px;
        transition: background-color var(--duration-fast) var(--ease-out);
    }

    :global(.faces-button:hover) {
        background: var(--theme-line);
    }
</style>
