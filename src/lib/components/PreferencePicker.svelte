<script lang="ts" generics="T extends string">
    import { browser } from '$app/env';
    import CheckMark from '#lib/ui/CheckMark.svelte';
    import type { Snippet } from 'svelte';

    // PROPS
    let {
        options,
        attribute,
        current,
        save,
        miniature
    }: {
        options: readonly { value: T, name: string }[]
        attribute: 'labels' | 'images'  // the data attribute on <html> that carries the choice
        current: T
        save: (value: T) => Promise<unknown>
        miniature: Snippet<[T]>
    } = $props()

    // The page attribute holds the latest choice, the load data keeps the value of the first page load
    let selected = $derived(browser ? document.documentElement.dataset[attribute] as T : current)

    // Applies right away, the cookie only matters for the next page load
    function choose(value: T){
        if(value === selected) return
        selected = value
        document.documentElement.dataset[attribute] = value
        save(value).catch(() => {})
    }
</script>

<div class="grid gap-note-gap sm:grid-cols-2">
    {#each options as option (option.value)}
        {@const active = selected === option.value}
        <button
            class={['option motion-interactive flex items-center gap-5 rounded-card border bg-card p-card text-left text-ink', active ? 'border-accent' : 'border-line hover:border-line-strong']}
            aria-pressed={active}
            onclick={() => choose(option.value)}
        >
            {@render miniature(option.value)}
            <span class="type-title flex-1 text-lg">{option.name}</span>
            <CheckMark {active} />
        </button>
    {/each}
</div>
