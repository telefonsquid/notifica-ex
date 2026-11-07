<script lang="ts">
    import { COLOR_GROUPS, colorName } from '#lib/notes.ts';
    import type { NoteColor } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Check } from '@lucide/svelte';
    import { Popover } from 'bits-ui';

    // PROPS
    let {
        value,
        onpick,
        label = 'Color',
        auto = '',
        class: className = ''
    }: {
        value: NoteColor
        onpick: (color: NoteColor) => void
        label?: string                          // what gets colored, for screen readers
        auto?: NoteColor                        // what a label paints while no color is picked
        class?: string
    } = $props()

    // No color of its own means the label's color when one applies
    const nameOf = (color: NoteColor) => (!color && auto ? `From label: ${colorName(auto)}` : colorName(color))
</script>

<!-- Stays open while picking, so colors can be tried on the note behind it -->
<!-- The rainbow ring sets it apart from a note of the same color and says what it opens -->
<Popover.Root>
    <Popover.Trigger
        class={['color-trigger motion-interactive grid size-7 shrink-0 place-items-center rounded-full hover:scale-110', className]}
        aria-label={`${label}: ${nameOf(value)}`}
        {@attach tip(`${label}: ${nameOf(value)}`)}
    >
        <span class="swatch note-surface size-full rounded-full border-2 border-raised" data-note={value || auto || undefined}></span>
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            sideOffset={10}
            collisionPadding={12}
            class="popover z-[60] grid gap-4 rounded-card border border-line-strong bg-raised p-4 text-ink shadow-2xl"
        >
            {#each COLOR_GROUPS as group (group.name)}
                <div>
                    <p class="type-meta mb-2 text-ink-faint">{group.name}</p>
                    <div class="grid grid-cols-[repeat(6,1.75rem)] gap-1.5 min-[24rem]:grid-cols-[repeat(9,1.75rem)]" role="radiogroup" aria-label={group.name}>
                        {#each group.colors as color (color)}
                            <!-- The ring sits outside the colored part, which brings its own ink -->
                            <button
                                class={['motion-interactive size-7 rounded-full hover:scale-110', value === color && 'picked']}
                                role="radio"
                                aria-checked={value === color}
                                aria-label={nameOf(color)}
                                {@attach tip(nameOf(color))}
                                onclick={() => onpick(color)}
                            >
                                <span class="swatch note-surface grid size-full place-items-center rounded-full border border-line-strong text-ink" data-note={color || auto || undefined}>
                                    {#if value === color}<Check class="size-3.5" strokeWidth={3} />{/if}
                                </span>
                            </button>
                        {/each}
                    </div>
                </div>
            {/each}
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    :global(.color-trigger) {
        padding: 2px;
        background: conic-gradient(oklch(0.72 0.17 25), oklch(0.82 0.16 85), oklch(0.75 0.15 150), oklch(0.7 0.13 230), oklch(0.65 0.17 300), oklch(0.72 0.17 25));
    }

    .picked {
        outline: 2px solid var(--theme-accent);
        outline-offset: 2px;
    }
</style>
