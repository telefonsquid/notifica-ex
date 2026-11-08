<script lang="ts" generics="T extends string">
    import { browser } from '$app/env';
    import type { PreferenceName } from '#lib/preferences.ts';
    import CheckMark from '#lib/ui/CheckMark.svelte';
    import type { Snippet } from 'svelte';
    import { setPreference } from '../../routes/api/settings.remote';

    // PROPS
    let {
        options,
        name,
        current,
        miniature
    }: {
        options: readonly { value: T, name: string }[]
        name: PreferenceName
        current: T
        miniature: Snippet<[T]>
    } = $props()

    // The page attribute holds the latest choice, the load data keeps the value of the first page load
    let selected = $derived(browser ? document.documentElement.dataset[name] as T : current)

    // Applies right away, the cookie only matters for the next page load
    function choose(value: T){
        if(value === selected) return
        selected = value
        document.documentElement.dataset[name] = value
        setPreference({ name, value }).catch(() => {})
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
