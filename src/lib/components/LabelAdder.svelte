<script lang="ts">
    import LabelChip from '#lib/components/LabelChip.svelte';
    import { randomLabelColor } from '#lib/note_colors.ts';
    import { resizable } from '#lib/resizable.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { Label } from '#lib/schemas/notes.ts';
    import { Plus } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import type { ClassValue } from 'svelte/elements';
    import { createLabel } from '../../routes/api/labels.remote';

    // PROPS
    let {
        labels,
        picked,
        onadd,
        onremove,
        class: className = ''
    }: {
        labels: Label[]
        picked: string[]                // already on the note, shown checked
        onadd: (id: string) => void
        onremove: (id: string) => void
        class?: ClassValue
    } = $props()

    let query = $state('')

    let name = $derived(query.trim())
    let matches = $derived(labels.filter((label) => label.name.toLowerCase().includes(name.toLowerCase())))
    let exact = $derived(labels.find((label) => label.name.toLowerCase() === name.toLowerCase()))

    function toggle(label: Label){
        if(picked.includes(label.id)) onremove(label.id)
        else onadd(label.id)
    }

    // Enter puts on the label of that exact name or creates it, never takes one off
    async function submit(){
        if(!name) return
        const label = exact ?? await safeAction(createLabel({ name, color: randomLabelColor() }))
        if(label && !picked.includes(label.id)) onadd(label.id)
        query = ''
    }
</script>

<!-- Stays open after a pick, so several labels go on in one go -->
<Popover.Root onOpenChange={(open) => { if(!open) query = '' }}>
    <Popover.Trigger class={['adder type-label motion-interactive flex h-full items-center gap-1 px-2 text-ink-muted hover:text-ink', className]} aria-label="Add label">
        <Plus class="size-3" />Label
    </Popover.Trigger>
    <Popover.Portal>
        <!-- Grows with its labels up to a limit, the corner sizes it by hand -->
        <Popover.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            class="popover relative z-[60] flex max-h-72 w-max max-w-[22rem] min-w-56 flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl"
            {@attach resizable({ min: { width: 192, height: 112 } })}
        >
            <form class="p-2 pb-0" onsubmit={(event) => { event.preventDefault(); submit() }}>
                <input
                    bind:value={query}
                    placeholder="Find or create a label"
                    aria-label="Label name"
                    class="w-full rounded-control bg-card px-3 py-2 text-sm outline-none"
                    {@attach (node) => node.focus()}
                />
            </form>

            <div class="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto p-2">
                {#each matches as label (label.id)}
                    {@const on = picked.includes(label.id)}
                    <LabelChip {label} state={on ? 'include' : null} dim={!on && picked.length > 0} onclick={() => toggle(label)} />
                {/each}
                {#if name && !exact}
                    <button type="button" class="create type-meta motion-interactive flex h-[1.625rem] items-center gap-1 rounded-[0.375rem] px-2.5 text-accent" onclick={submit}>
                        <Plus class="size-3" />Create “{name}”
                    </button>
                {:else if !matches.length}
                    <p class="type-meta px-1 py-1.5 text-ink-faint">Type a name to create one</p>
                {/if}
            </div>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    /* Same tab shape as the labels, raised off the page so it reads on any background */
    :global(.adder) {
        background-color: var(--theme-raised);
        border: 1px solid var(--theme-line-strong);
        border-bottom: none;
        border-radius: 0.375rem 0.375rem 0 0;
    }

    :global([data-labels='bottom'] .adder) {
        border-top: none;
        border-bottom: 1px solid var(--theme-line-strong);
        border-radius: 0 0 0.375rem 0.375rem;
    }

    .create {
        border: 1px dashed var(--theme-accent);
    }
</style>
