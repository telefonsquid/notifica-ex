<script lang="ts">
    import { randomLabelColor } from '#lib/note_colors.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { Label } from '#lib/schemas/notes.ts';
    import { Plus } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import type { ClassValue } from 'svelte/elements';
    import { createLabel } from '../../routes/api/labels.remote';

    // PROPS
    let {
        labels,
        taken,
        onadd,
        class: className = ''
    }: {
        labels: Label[]
        taken: string[]                 // already on the note, left out of the list
        onadd: (id: string) => void
        class?: ClassValue
    } = $props()

    let query = $state('')

    let name = $derived(query.trim())
    let matches = $derived(labels.filter((label) => !taken.includes(label.id) && label.name.toLowerCase().includes(name.toLowerCase())))
    let exact = $derived(labels.find((label) => label.name.toLowerCase() === name.toLowerCase()))

    function pick(label: Label){
        if(!taken.includes(label.id)) onadd(label.id)
        query = ''
    }

    // Enter takes the label of that exact name or creates it
    async function submit(){
        if(!name) return
        const label = exact ?? await safeAction(createLabel({ name, color: randomLabelColor() }))
        if(label) pick(label)
    }
</script>

<!-- Stays open after a pick, so several labels go on in one go -->
<Popover.Root onOpenChange={(open) => { if(!open) query = '' }}>
    <Popover.Trigger class={['adder type-meta motion-interactive flex h-full items-center gap-1 px-2 text-ink-faint hover:text-ink', className]} aria-label="Add label">
        <Plus class="size-3" />Label
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            class="popover z-[60] flex max-h-72 w-64 flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl"
        >
            <form class="border-b border-line p-2" onsubmit={(event) => { event.preventDefault(); submit() }}>
                <input
                    bind:value={query}
                    placeholder="Find or create a label"
                    aria-label="Label name"
                    class="w-full rounded-control bg-card px-3 py-2 text-sm outline-none"
                    {@attach (node) => node.focus()}
                />
            </form>

            <ul class="min-h-0 overflow-y-auto p-1.5">
                {#each matches as label (label.id)}
                    <li>
                        <button class="type-meta motion-interactive flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-ink-muted hover:bg-line hover:text-ink" onclick={() => pick(label)}>
                            <span class="note-mark h-1.5 w-3 rounded-full" data-note={label.color || undefined}></span>{label.name}
                        </button>
                    </li>
                {/each}
                {#if name && !exact}
                    <li>
                        <button class="type-meta motion-interactive flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-accent hover:bg-line" onclick={submit}>
                            <Plus class="size-3" />Create “{name}”
                        </button>
                    </li>
                {:else if !matches.length}
                    <li class="type-meta px-2.5 py-2 text-ink-faint">{name ? 'Already on this note' : labels.length ? 'All labels are on' : 'Type a name to create one'}</li>
                {/if}
            </ul>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    /* Same tab shape as the labels, drawn as an outline */
    :global(.adder) {
        border: 1px dashed var(--theme-line-strong);
        border-bottom: none;
        border-radius: 0.375rem 0.375rem 0 0;
    }

    :global([data-labels='bottom'] .adder) {
        border-top: none;
        border-bottom: 1px dashed var(--theme-line-strong);
        border-radius: 0 0 0.375rem 0.375rem;
    }
</style>
