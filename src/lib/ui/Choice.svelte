<script lang="ts" generics="T extends string">
    import { Check, ChevronDown } from '@lucide/svelte';
    import { Select } from 'bits-ui';
    import type { ClassValue } from 'svelte/elements';

    // PROPS
    let {
        value = $bindable(),
        groups,
        label,
        onchange,
        class: className = ''
    }: {
        value: T
        groups: { value: T, label: string }[][]     // a line runs between groups
        label: string
        onchange?: (value: T) => void
        class?: ClassValue
    } = $props()

    let picked = $derived(groups.flat().find((option) => option.value === value))

    function pick(next: string){
        value = next as T
        onchange?.(value)
    }
</script>

<!-- Dropdown in the look of a field, the native one can't set apart groups or follow the theme -->
<Select.Root type="single" {value} onValueChange={pick} items={groups.flat()}>
    <Select.Trigger class={['choice flex h-9 items-center gap-1.5 rounded-control border border-line bg-raised pr-2 pl-2.5 text-sm text-ink', className]} aria-label={label}>
        <span class="truncate">{picked?.label}</span>
        <ChevronDown class="ml-auto size-3.5 shrink-0 text-ink-faint" />
    </Select.Trigger>
    <Select.Portal>
        <Select.Content class="menu" style="min-width: max(8rem, var(--bits-select-anchor-width))" sideOffset={6} collisionPadding={12}>
            {#each groups as group, index (index)}
                {#if index}<div class="menu-separator" role="separator"></div>{/if}
                {#each group as option (option.value)}
                    <Select.Item class="menu-item" value={option.value} label={option.label}>
                        {#snippet children({ selected })}
                            {option.label}
                            {#if selected}<Check class="ml-auto size-3.5" />{/if}
                        {/snippet}
                    </Select.Item>
                {/each}
            {/each}
        </Select.Content>
    </Select.Portal>
</Select.Root>

<style>
    :global(.choice) {
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    :global(.choice:hover) {
        border-color: var(--theme-line-strong);
    }

    :global(.choice:focus-visible, .choice[data-state='open']) {
        border-color: var(--theme-accent);
        outline: none;
    }
</style>
