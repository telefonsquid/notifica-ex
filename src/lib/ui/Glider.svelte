<script lang="ts" module>
    import type { Tag } from '@lucide/svelte';

    export type GliderOption<T extends string = string> = { value: T, text: string, icon?: typeof Tag }
</script>

<script lang="ts" generics="T extends string">
    // PROPS
    let {
        name,
        options,
        value,
        onpick,
        class: className
    }: {
        name: string                    // read out for the whole group
        options: GliderOption<T>[]
        value: T
        onpick: (value: T) => void
        class?: string
    } = $props()

    const index = $derived(Math.max(0, options.findIndex((option) => option.value === value)))
</script>

<!-- Segments share one thumb that glides to the picked one -->
<div class={['glider', className]} role="radiogroup" aria-label={name} style:--count={options.length} style:--index={index}>
    <span class="thumb" aria-hidden="true"></span>
    {#each options as option (option.value)}
        {@const Icon = option.icon}
        <button type="button" role="radio" aria-checked={value === option.value} class={[value === option.value && 'on']} onclick={() => onpick(option.value)}>
            {#if Icon}<Icon class="size-4" />{/if}
            <span>{option.text}</span>
        </button>
    {/each}
</div>

<style>
    .glider {
        position: relative;
        isolation: isolate;
        display: grid;
        grid-template-columns: repeat(var(--count), minmax(0, 1fr));
        padding: 0.1875rem;
        border-radius: 999px;
        background: var(--theme-line);
    }

    .thumb {
        position: absolute;
        z-index: -1;
        inset-block: 0.1875rem;
        left: 0.1875rem;
        width: calc((100% - 0.375rem) / var(--count));
        translate: calc(var(--index) * 100%) 0;
        border-radius: inherit;
        background: var(--theme-raised);
        box-shadow: 0 1px 3px color-mix(in oklab, var(--theme-ink) 14%, transparent);
        transition: translate var(--duration-base) var(--ease-in-out);
    }

    button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        min-width: 0;
        padding: 0.3125rem 0.5rem;
        border-radius: inherit;
        color: var(--theme-ink-faint);
        font-size: 0.8125rem;
        white-space: nowrap;
        transition: color var(--duration-fast) var(--ease-out);
    }

    button:hover { color: var(--theme-ink-muted); }
    button.on { color: var(--theme-ink); }
</style>
