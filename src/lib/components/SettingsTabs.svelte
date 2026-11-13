<script lang="ts">
    import { unfold } from '#lib/motion.ts';
    import { ChevronDown } from '@lucide/svelte';
    import type { Component } from 'svelte';

    type Section = { id: string, label: string, icon: Component<{ class?: string, strokeWidth?: number }>, group?: string }

    // PROPS
    let {
        sections,
        current,
        onpick
    }: {
        sections: Section[]
        current: string
        onpick: (id: string) => void
    } = $props()

    let tablist = $state<HTMLElement>()
    let indicator = $state({ x: 0, y: 0, width: 0, height: 0 })
    let ready = $state(false)

    let open = $state(false)        // The phone list
    let shown = $derived(sections.find((item) => item.id === current) ?? sections[0])

    function buttonOf(id: string){
        return tablist?.querySelector<HTMLElement>(`[data-tab="${id}"]`)
    }

    function place() {
        const button = buttonOf(current)
        if (!button) return

        indicator = { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight }
    }

    $effect(place)

    $effect(() => {
        if (!tablist) return
        const observer = new ResizeObserver(place)
        observer.observe(tablist)
        requestAnimationFrame(() => (ready = true)); // The first placement shows at once
        return () => observer.disconnect()
    });

    // Arrow keys walk the tabs and move focus along
    function step(event: KeyboardEvent) {
        const delta = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[event.key]
        if (!delta) return
        event.preventDefault()

        const index = sections.findIndex((item) => item.id === current)
        const next = sections[Math.min(Math.max(index + delta, 0), sections.length - 1)]
        onpick(next.id)
        buttonOf(next.id)?.focus()
    }

    function pick(id: string){
        open = false
        onpick(id)
    }

    // Back and Escape fold the list before anything else
    function close(event: KeyboardEvent){
        if(!open || event.key !== 'Escape') return
        event.preventDefault()
        open = false
    }
</script>

<svelte:window onkeydown={close} />

{#snippet breakBefore(index: number)}
    {#if index > 0 && sections[index].group !== sections[index - 1].group}
        <span class="break" aria-hidden="true"></span>
    {/if}
{/snippet}

<!-- PHONES | the current section names the list, the chevron folds the others out -->
<nav class="picker sm:hidden" aria-label="Settings sections">
    <button class="head" aria-expanded={open} aria-controls="settings-picker" onclick={() => (open = !open)}>
        <shown.icon class="size-5 shrink-0" strokeWidth={1.75} />
        <span class="min-w-0 flex-1 truncate text-left">{shown.label}</span>
        <ChevronDown class={['chevron size-5 shrink-0', open && 'open']} strokeWidth={1.75} />
    </button>

    {#if open}
        <div id="settings-picker" class="list" transition:unfold>
            {#each sections as item, index (item.id)}
                {@render breakBefore(index)}
                <button class={['item', current === item.id && 'active']} aria-current={current === item.id} onclick={() => pick(item.id)}>
                    <item.icon class="size-5 shrink-0" strokeWidth={1.75} />
                    <span class="truncate">{item.label}</span>
                </button>
            {/each}
        </div>
    {/if}
</nav>

<!-- WIDER SCREENS | a row on tablets, a column on wide screens -->
<div bind:this={tablist} class={['tabs', ready && 'ready']} role="tablist" aria-label="Settings sections" tabindex="-1" onkeydown={step}>
    <span class="indicator riso-plate" style:--x="{indicator.x}px" style:--y="{indicator.y}px" style:--width="{indicator.width}px" style:--height="{indicator.height}px"></span>
    {#each sections as item, index (item.id)}
        {@render breakBefore(index)}
        <button
            role="tab"
            data-tab={item.id}
            class={['tab', current === item.id && 'active']}
            aria-selected={current === item.id}
            aria-controls={item.id}
            tabindex={current === item.id ? 0 : -1}
            onclick={() => onpick(item.id)}
        >
            <item.icon class="size-5 shrink-0" strokeWidth={1.75} />
            <span class="max-w-full truncate">{item.label}</span>
        </button>
    {/each}
</div>

<style>
    /* PHONE LIST | a printed sheet like the toasts */
    .picker {
        overflow: hidden;
        border: 1.5px solid var(--theme-riso-rule);
        border-radius: var(--layout-radius-card);
        background: var(--theme-riso-paper);
        box-shadow: var(--riso-x) var(--riso-y) 0 var(--theme-riso-ghost);
    }

    .head,
    .item {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        width: 100%;
        padding: 0.75rem 1rem;
    }

    .head {
        color: var(--theme-ink);
    }

    .picker :global(.chevron) {
        color: var(--theme-ink-muted);
        transition: rotate var(--duration-base) var(--ease-in-out);
    }

    .picker :global(.chevron.open) {
        rotate: 180deg;
    }

    .list {
        display: grid;
        padding: 0 0.375rem 0.375rem;
    }

    .item {
        border-radius: var(--layout-radius-control);
        color: var(--theme-ink-muted);
    }

    .item.active {
        color: var(--theme-accent);
    }

    /* TABS */
    .tabs {
        position: relative;
        display: flex;
        gap: 0.25rem;
        outline: none;
    }

    /* Phones get the list instead | a utility class loses against the display above */
    @media (width < 40rem) {
        .tabs {
            display: none;
        }
    }

    @media (width >= 64rem) {
        .tabs {
            flex-direction: column;
            align-self: start;
            padding-top: var(--peek);
        }
    }

    /* GROUP BREAK | a hairline with room around it, across the list on phones and wide screens */
    .break {
        flex: none;
        align-self: center;
        width: 1px;
        height: 60%;
        margin-inline: 0.5rem;
        background: var(--theme-line-strong);
    }

    .list .break {
        align-self: stretch;
        width: auto;
        height: 1px;
        margin: 0.375rem 0.625rem;
    }

    @media (width >= 64rem) {
        .break {
            align-self: stretch;
            width: auto;
            height: 1px;
            margin: 1rem 0.875rem;
        }
    }

    /* Long names take more of the row, nine tabs no longer fit in equal shares */
    .tab {
        position: relative;
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: 0.25rem;
        align-items: center;
        justify-content: center;
        min-width: 0;
        padding: 0.5rem 0.375rem;
        border-radius: var(--layout-radius-control);
        color: var(--theme-ink-muted);
        font-size: 0.75rem;
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    @media (width >= 64rem) {
        .tab {
            flex: none;
            flex-direction: row;
            gap: 0.75rem;
            justify-content: start;
            padding: 0.625rem 0.875rem;
            font-size: inherit;
            text-align: left;
        }
    }

    .tab:not(.active):hover,
    .item:hover {
        color: var(--theme-ink);
        background: var(--theme-line);
    }

    /* Takes on the colour in step with the indicator gliding in */
    .tab.active {
        color: var(--theme-riso-on-plate);
        background: transparent;
        transition: color var(--duration-base) var(--ease-in-out);
    }

    /* Until the indicator knows its place the tab paints itself */
    .tabs:not(.ready) .tab.active {
        background: var(--theme-riso-plate);
    }

    .indicator {
        position: absolute;
        top: 0;
        left: 0;
        width: var(--width);
        height: var(--height);
        border-radius: var(--layout-radius-control);
        translate: var(--x) var(--y);
        opacity: 0;
    }

    .tabs.ready .indicator {
        opacity: 1;
        transition: translate var(--duration-base) var(--ease-emphasized), width var(--duration-base) var(--ease-emphasized), height var(--duration-base) var(--ease-emphasized);
    }
</style>
