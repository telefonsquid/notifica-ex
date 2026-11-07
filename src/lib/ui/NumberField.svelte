<script lang="ts">
    import { ChevronDown, ChevronUp } from '@lucide/svelte';
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let {
        value = $bindable(1),
        min = 1,
        max = 999,
        label,
        class: className = '',
        onchange
    }: {
        value?: number
        min?: number
        max?: number
        label: string
        class?: ClassValue
        onchange?: (value: number) => void      // an arrow or leaving the field, not every keystroke
    } = $props()

    function step(by: number){
        value = Math.min(max, Math.max(min, (Number(value) || min) + by))
        onchange?.(value)
    }

    // A cleared or out of range field falls back once it loses focus
    function settle(){
        step(0)
    }
</script>

<!-- The browser's own spinners are hidden, these sit apart from the number -->
<div class={['number flex h-9 items-center overflow-hidden rounded-control border border-line bg-raised text-ink', className]}>
    <input
        type="number"
        bind:value
        {min}
        {max}
        aria-label={label}
        class="w-0 min-w-0 flex-1 bg-transparent pr-1.5 pl-2.5 text-sm tabular-nums outline-none"
        onblur={settle}
    />
    <div class="flex flex-col self-stretch border-l border-line">
        <button type="button" class="arrow" tabindex="-1" aria-label="More" disabled={value >= max} onclick={() => step(1)}><ChevronUp class="size-3" strokeWidth={2.5} /></button>
        <button type="button" class="arrow" tabindex="-1" aria-label="Less" disabled={value <= min} onclick={() => step(-1)}><ChevronDown class="size-3" strokeWidth={2.5} /></button>
    </div>
</div>

<style>
    .number {
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .number:hover {
        border-color: var(--theme-line-strong);
    }

    .number:focus-within {
        border-color: var(--theme-accent);
    }

    input {
        appearance: textfield;
    }

    input::-webkit-inner-spin-button,
    input::-webkit-outer-spin-button {
        appearance: none;
        margin: 0;
    }

    .arrow {
        display: grid;
        flex: 1;
        place-items: center;
        padding-inline: 0.375rem;
        color: var(--theme-ink-faint);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .arrow:hover:not(:disabled) {
        color: var(--theme-ink);
        background: var(--theme-line);
    }

    .arrow:disabled {
        opacity: 0.4;
    }
</style>
