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

<!-- Phones fit both options in one row, the miniature above the name -->
<div class="grid grid-cols-2 gap-note-gap">
    {#each options as option (option.value)}
        {@const active = selected === option.value}
        <button
            class={['option motion-interactive grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-card border bg-card p-3 text-left text-ink sm:flex sm:gap-5 sm:p-card', active ? 'border-accent' : 'border-line hover:border-line-strong']}
            aria-pressed={active}
            onclick={() => choose(option.value)}
        >
            <div class="col-span-2 sm:contents">{@render miniature(option.value)}</div>
            <span class="type-title min-w-0 flex-1 truncate sm:text-lg">{option.name}</span>
            <CheckMark {active} />
        </button>
    {/each}
</div>
