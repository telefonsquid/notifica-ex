<script lang="ts">
    import type { Label } from '#lib/schemas/notes.ts';
    import { Check, Minus } from '@lucide/svelte';

    // PROPS
    let {
        label,
        state,
        dim = false,
        onclick
    }: {
        label: Label
        state: 'include' | 'exclude' | null     // picked shows a check, left out a strike
        dim?: boolean                           // others are picked, this one is not
        onclick: () => void
    } = $props()
</script>

<!-- One label to pick, in the card tabs' colour and type -->
<button
    type="button"
    class={['label-chip note-mark type-meta', state, dim && 'dim']}
    data-note={label.color || undefined}
    aria-label={`${label.name}: ${state === 'include' ? 'picked' : state === 'exclude' ? 'left out' : 'not picked'}`}
    aria-pressed={state === 'include'}
    {onclick}
>
    {#if state === 'include'}<Check class="size-3" strokeWidth={3} />{:else if state === 'exclude'}<Minus class="size-3" strokeWidth={3} />{/if}
    <span class="name">{label.name}</span>
</button>

<style>
    .label-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        height: 1.625rem;
        padding-inline: 0.625rem;
        border-radius: 0.375rem;
        white-space: nowrap;
        transition: opacity var(--duration-base) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .label-chip:hover { scale: 1.05; opacity: 1; }
    .label-chip:active { scale: 0.95; }

    .label-chip.exclude { opacity: 0.6; }
    .label-chip.exclude .name { text-decoration: line-through; text-decoration-thickness: 1.5px; }
    .label-chip.dim { opacity: 0.45; }
</style>
