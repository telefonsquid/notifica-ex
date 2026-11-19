<script lang="ts">
    import { COLOR_GROUPS, colorName } from '#lib/note_colors.ts';
    import type { Label, NoteColor } from '#lib/schemas/notes.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { Check } from '@lucide/svelte';
    import { Popover } from 'bits-ui';

    // PROPS
    let {
        value,
        onpick,
        label,
        labels = [],
        rainbow = false,
        class: className = ''
    }: {
        value: NoteColor
        onpick: (color: NoteColor) => void
        label: string                           // what gets colored, for screen readers
        labels?: Label[]                        // the note's labels, their colors join Default as quick picks
        rainbow?: boolean                       // on a note, which already wears its color
        class?: string
    } = $props()

    // One swatch per color, the first label of each color names it
    let fromLabels = $derived(labels.filter((item, index) => item.color && labels.findIndex((other) => other.color === item.color) === index))
</script>

{#snippet swatch(color: NoteColor, name: string, picked: boolean, extra = '')}
    <!-- The ring sits outside the colored part, which brings its own ink -->
    <button
        class="swatch-ring size-7 rounded-full"
        data-picked={picked ? '' : undefined}
        role="radio"
        aria-checked={picked}
        aria-label={name}
        {@attach tip(name)}
        onclick={() => onpick(color)}
    >
        <span class={['swatch note-surface grid size-full place-items-center rounded-full border border-line-strong text-ink', extra]} data-note={color || undefined}>
            {#if picked}<Check class="size-3.5" strokeWidth={3} />{/if}
        </span>
    </button>
{/snippet}

<!-- Stays open while picking, so colors can be tried on the note behind it -->
<!-- A note shows its color already, its trigger is a rainbow that says colors live here | elsewhere the color itself is what counts -->
<Popover.Root>
    <Popover.Trigger
        class={['swatch-ring size-7 shrink-0 rounded-full', rainbow && 'rainbow', className]}
        aria-label={`${label}: ${colorName(value)}`}
        {@attach tip(`${label}: ${colorName(value)}`)}
    >
        {#if !rainbow}
            <span class={['swatch note-surface block size-full rounded-full border border-line-strong', !value && 'default']} data-note={value || undefined}></span>
        {/if}
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            sideOffset={10}
            collisionPadding={12}
            class="color-panel popover z-[60] grid max-h-(--bits-popover-content-available-height) gap-4 overflow-y-auto overscroll-contain rounded-card border border-line-strong bg-raised p-4 text-ink shadow-2xl max-sm:max-h-[calc(100dvh-env(safe-area-inset-top)-2rem)]"
        >
            {#each COLOR_GROUPS as group (group.name)}
                <div>
                    <p class="type-meta mb-2 text-ink-faint">{group.name}</p>
                    <div class="grid grid-cols-[repeat(6,1.75rem)] gap-1.5 min-[24rem]:grid-cols-[repeat(9,1.75rem)]" role="radiogroup" aria-label={group.name}>
                        {#each group.colors as color (color)}
                            {@render swatch(color, colorName(color), value === color, color ? '' : 'default')}
                        {/each}
                        {#if !group.colors[0]}
                            {#each fromLabels as item (item.id)}
                                {@render swatch(item.color, `Label: ${item.name}`, false)}
                            {/each}
                        {/if}
                    </div>
                </div>
            {/each}
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<style>
    /* The colors turn a little under the pointer, as if picking one */
    @property --rainbow-turn {
        syntax: '<angle>';
        inherits: false;
        initial-value: 0deg;
    }

    /* Turns the gradient, not the button | a rotated button snaps back a subpixel once it stops */
    :global(.rainbow) {
        background: conic-gradient(from var(--rainbow-turn), oklch(0.72 0.17 25), oklch(0.82 0.16 85), oklch(0.75 0.15 150), oklch(0.7 0.13 230), oklch(0.65 0.17 300), oklch(0.72 0.17 25));
        transition: outline-color var(--duration-fast) var(--ease-out), outline-offset var(--duration-base) var(--ease-out), --rainbow-turn var(--duration-slow) var(--ease-out);
    }

    :global(.rainbow:hover) {
        --rainbow-turn: 90deg;
    }

    /* Phones get it in the middle of the screen, away from the trigger | the empty rest lets touches through to close it */
    @media (width < 40rem) {
        :global([data-bits-floating-content-wrapper]:has(> .color-panel)) {
            position: fixed !important;
            inset: env(safe-area-inset-top) 0 0 !important;
            transform: none !important;
            min-width: 0 !important;
            display: grid;
            place-items: center;
            pointer-events: none;
        }

        :global(.color-panel) {
            transform-origin: center;
            pointer-events: auto;
        }
    }

    /* Default holds no color of its own, the dashed edge tells it from Plain */
    .default {
        border-style: dashed;
        border-color: var(--theme-ink-faint);
    }
</style>
