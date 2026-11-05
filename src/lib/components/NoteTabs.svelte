<script lang="ts">
    import LabelAdder from '#lib/components/LabelAdder.svelte';
    import LabelEditor from '#lib/components/LabelEditor.svelte';
    import { deleteLabelEverywhere } from '#lib/deletions.ts';
    import { appear, unfold } from '#lib/motion.ts';
    import type { Label } from '#lib/schemas.ts';
    import { Pencil, Trash2, X } from '@lucide/svelte';
    import { ContextMenu } from 'bits-ui';

    /*
        A note's labels as folder tabs on the top or bottom edge of its card, named on hover
        and while open. The add tab keeps to the far end.
    */

    // PROPS
    let {
        picked = $bindable(),
        labels,
        open,
        owned
    }: {
        picked: string[]        // Label ids on the note
        labels: Label[]
        open: boolean
        owned: boolean          // Only the owner gets to add labels
    } = $props()

    let tabs = $derived(picked.flatMap((id) => labels.find((label) => label.id === id) ?? []))

    // The tab menu opens the same editor as a click on the tab name
    let editing = $state<string | null>(null)

    function drop(id: string){
        picked = picked.filter((item) => item !== id)
    }

    // Waits for the menu to close, its focus return would shut the popover again
    function edit(id: string){
        setTimeout(() => editing = id)
    }
</script>

{#if tabs.length || (open && owned)}
    <ul class="tabs absolute flex gap-1" aria-label="Labels">
        {#each tabs as label (label.id)}
            <!-- A closed card's right click opens the note's menu, an open one gives each tab its own -->
            <ContextMenu.Root>
                <ContextMenu.Trigger disabled={!open}>
                    {#snippet child({ props })}
                        <li {...props} class="tab note-mark type-meta flex min-w-6 items-center gap-0.5 px-2.5" data-note={label.color || undefined}>
                            {#if open}
                                <LabelEditor
                                    {label}
                                    bind:open={() => editing === label.id, (value) => editing = value ? label.id : null}
                                    ondelete={() => drop(label.id)}
                                />
                                <button class="remove -mr-2 grid shrink-0 place-items-center rounded-full p-0.5" aria-label={`Remove ${label.name}`} onclick={() => drop(label.id)} in:appear out:unfold={{ axis: 'x' }}>
                                    <X class="size-3" />
                                </button>
                            {:else}
                                <span class="name truncate">{label.name}</span>
                            {/if}
                        </li>
                    {/snippet}
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                    <ContextMenu.Content class="menu" collisionPadding={12}>
                        <ContextMenu.Item class="menu-item" onSelect={() => edit(label.id)}>
                            <Pencil class="size-4" />Edit label
                        </ContextMenu.Item>
                        <ContextMenu.Item class="menu-item" onSelect={() => drop(label.id)}>
                            <X class="size-4" />Remove from note
                        </ContextMenu.Item>
                        <ContextMenu.Separator class="menu-separator" />
                        <ContextMenu.Item class="menu-item" onSelect={async () => { if(await deleteLabelEverywhere(label)) drop(label.id) }}>
                            <Trash2 class="size-4" />Delete label
                        </ContextMenu.Item>
                    </ContextMenu.Content>
                </ContextMenu.Portal>
            </ContextMenu.Root>
        {/each}
        {#if open && owned}
            <li class="adder-tab ml-auto shrink-0" in:appear out:unfold={{ axis: 'x' }}>
                <LabelAdder class="h-full" {labels} taken={picked} onadd={(id) => picked = [...picked, id]} />
            </li>
        {/if}
    </ul>
{/if}

<style>
    /* Inset by the corner radius so they sit on the straight part of the edge */
    .tabs {
        bottom: 100%;
        left: var(--layout-radius-card);
        max-width: calc(100% - 2 * var(--layout-radius-card));
        align-items: end;
        overflow: hidden;
        pointer-events: none;
    }

    :global(.note.open) .tabs {
        right: var(--layout-radius-card);
        pointer-events: auto;
    }

    .tab {
        height: 0.3125rem;
        border-radius: 0.375rem 0.375rem 0 0;
        transition: height var(--duration-base) var(--ease-spring);
    }

    .adder-tab {
        height: 1.375rem;
        transition: opacity var(--duration-fast) var(--ease-in);
    }

    /* Bottom edge as picked in the settings, the tabs then grow downwards */
    :global([data-labels='bottom']) .tabs {
        top: 100%;
        bottom: auto;
        align-items: start;
    }

    :global([data-labels='bottom']) .tab {
        border-radius: 0 0 0.375rem 0.375rem;
    }

    .name {
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-out);
    }

    :global(.note:hover) .tab,
    :global(.note:focus-within) .tab {
        height: 1.25rem;
    }

    :global(.note.open) .tab {
        height: 1.375rem;
    }

    :global(.note:hover) .name,
    :global(.note:focus-within) .name {
        opacity: 1;
        transition-delay: calc(var(--duration-fast) * 0.5);
    }

    .remove {
        opacity: 0.6;
        transition: opacity var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .remove:hover {
        opacity: 1;
        background: color-mix(in oklab, currentColor 15%, transparent);
    }

    /* Fade before the card shrinks */
    :global(.note.folded) .remove,
    :global(.note.folded) .adder-tab {
        opacity: 0;
    }
</style>
