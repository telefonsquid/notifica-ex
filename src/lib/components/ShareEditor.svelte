<script lang="ts">
    import { notify } from '#lib/notifications.svelte.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import type { Person } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Initials from '#lib/ui/Initials.svelte';
    import { Send, Users, X } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import { shareNote, unshareNote } from '../../routes/api/notes.remote';

    // PROPS
    let {
        owner,
        sharedWith,
        me,
        people,
        ensureNote,
        onleave
    }: {
        owner: string
        sharedWith: string[]
        me: string
        people: Map<string, Person>
        ensureNote: () => Promise<string | null>     // a new note gets stored first, sharing needs its id
        onleave: () => void                         // this user took themselves off, the note is gone for them
    } = $props()

    let mine = $derived(owner === me)
    let email = $state('')
    let busy = $state(false)

    function nameOf(id: string): string {
        if(id === me) return 'You'
        const person = people.get(id)
        return person?.name || person?.email || 'Someone'
    }

    async function share(){
        const address = email.trim()
        if(!address) return
        busy = true
        const id = await ensureNote()
        const person = id && await safeAction(shareNote({ id, email: address }))
        busy = false
        if(!id) notify('Write something first, an empty note cannot be shared.', { type: 'error' })
        if(person) email = ''
    }

    async function remove(person: string){
        const id = await ensureNote()
        if(!id || !await safeAction(unshareNote({ id, person }))) return
        if(person === me) onleave()
    }
</script>

<Popover.Root>
    <Popover.Trigger class={['icon-button', sharedWith.length && 'text-secondary']} aria-label="Share" {@attach tip(mine ? 'Share' : 'Shared with you')}>
        <Users class="size-4" />
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content side="top" align="end" sideOffset={8} collisionPadding={12} class="popover z-[60] grid w-80 gap-2 p-2">

            <!-- PEOPLE | the owner first -->
            <ul class="grid gap-0.5">
                {#each [owner, ...sharedWith] as person (person)}
                    <li class="flex min-h-10 items-center gap-2.5 rounded-control px-2">
                        <Initials name={nameOf(person)} />
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm text-ink">{nameOf(person)}</span>
                            {#if person !== me && people.get(person)?.email}<span class="block truncate text-xs text-ink-faint">{people.get(person)?.email}</span>{/if}
                        </span>
                        {#if person === owner}
                            <span class="type-meta text-ink-faint">Owner</span>
                        {:else if mine || person === me}
                            <button class="icon-button -mr-1 p-1.5" aria-label={person === me ? 'Leave this note' : `Stop sharing with ${nameOf(person)}`} onclick={() => remove(person)} {@attach tip(person === me ? 'Leave, the owner keeps it' : 'Stop sharing')}>
                                <X class="size-3.5" />
                            </button>
                        {/if}
                    </li>
                {/each}
            </ul>

            <!-- INVITE | by the email someone logs in with -->
            {#if mine}
                <form class="flex gap-1.5 border-t border-line pt-2" onsubmit={(event) => { event.preventDefault(); share() }}>
                    <input bind:value={email} type="email" placeholder="Share by email" aria-label="Email to share with" class="field flex-1 text-sm" {@attach (node) => node.focus()} />
                    <button type="submit" class="icon-button text-accent" aria-label="Share" disabled={busy || !email.trim()} {@attach tip('Share')}>
                        <Send class="size-4" />
                    </button>
                </form>
            {/if}

        </Popover.Content>
    </Popover.Portal>
</Popover.Root>
