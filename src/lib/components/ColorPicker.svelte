<script lang="ts">
    import { COLOR_GROUPS, colorName } from '#lib/notes.ts';
    import type { NoteColor } from '#lib/schemas.ts';
    import { Check } from '@lucide/svelte';
    import { Popover } from 'bits-ui';

    // PROPS
    let {
        value,
        onpick,
        label = 'Color',
        class: className = ''
    }: {
        value: NoteColor
        onpick: (color: NoteColor) => void
        label?: string                          // what gets colored, for screen readers
        class?: string
    } = $props()
</script>

<!-- Stays open while picking, so colors can be tried on the note behind it -->
<Popover.Root>
    <Popover.Trigger
        class={['swatch note-surface motion-interactive size-6 shrink-0 rounded-full border border-line-strong hover:scale-110', className]}
        data-note={value || undefined}
        aria-label={`${label}: ${colorName(value)}`}
        title={colorName(value)}
    />
    <Popover.Portal>
        <Popover.Content
            sideOffset={10}
            collisionPadding={12}
            class="palette z-[60] grid gap-4 rounded-card border border-line-strong bg-raised p-4 text-ink shadow-2xl"
        >
            {#each COLOR_GROUPS as group (group.name)}
                <div>
                    <p class="type-meta mb-2 text-ink-faint">{group.name}</p>
                    <div class="grid grid-cols-[repeat(6,1.75rem)] gap-1.5 min-[24rem]:grid-cols-[repeat(9,1.75rem)]" role="radiogroup" aria-label={group.name}>
                        {#each group.colors as color (color)}
                            <button
                                class={['swatch note-surface motion-interactive grid size-7 place-items-center rounded-full border border-line-strong text-ink hover:scale-110', value === color && 'picked']}
                                data-note={color || undefined}
                                role="radio"
                                aria-checked={value === color}
                                aria-label={colorName(color)}
                                title={colorName(color)}
                                onclick={() => onpick(color)}
                            >
                                {#if value === color}<Check class="size-3.5" strokeWidth={3} />{/if}
                            </button>
                        {/each}
                    </div>
                </div>
            {/each}
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    .picked {
        outline: 2px solid var(--theme-accent);
        outline-offset: 2px;
    }

    /* Grows out of the swatch that opened it */
    :global(.palette[data-state='open']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: palette-in var(--duration-base) var(--ease-spring);
    }

    :global(.palette[data-state='closed']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: palette-in var(--duration-fast) var(--ease-in) reverse forwards;
    }

    @keyframes palette-in {
        from { opacity: 0; scale: 0.9; }
    }
</style>
