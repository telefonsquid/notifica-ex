<script lang="ts">
    import type { Person } from '#lib/schemas/notes.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Check, UserPlus } from '@lucide/svelte';
    import { Popover } from 'bits-ui';

    // PROPS | every pick hands back the whole new list
    let {
        people,
        shared,
        onchange
    }: {
        people: Person[]                // everyone but the owner
        shared: string[]
        onchange: (shared: string[]) => void
    } = $props()

    let query = $state('')
    let matches = $derived(people.filter((person) => person.name.toLowerCase().includes(query.trim().toLowerCase())))

    function toggle(id: string){
        onchange(shared.includes(id) ? shared.filter((item) => item !== id) : [...shared, id])
    }
</script>

<!-- Stays open after a pick, so several people join in one go -->
<Popover.Root onOpenChange={(open) => { if(!open) query = '' }}>
    <Popover.Trigger class="icon-button" aria-label="Share" {@attach tip('Share')}>
        <UserPlus class="size-4" />
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            class="popover z-[60] flex max-h-80 w-64 flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl"
        >
            {#if people.length > 6}
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
                    <li class="type-meta px-2.5 py-2 text-ink-faint">{people.length ? 'Nobody by that name' : 'Nobody else has an account yet'}</li>
                {/each}
            </ul>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>
