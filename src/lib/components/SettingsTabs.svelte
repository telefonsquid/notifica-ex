<script lang="ts">
    import type { Component } from 'svelte';

    // PROPS
    let {
        sections,
        current,
        onpick
    }: {
        sections: { id: string, label: string, icon: Component<{ class?: string, strokeWidth?: number }> }[]
        current: string
        onpick: (id: string) => void
    } = $props()

    let tablist = $state<HTMLElement>()
    let indicator = $state({ x: 0, y: 0, width: 0, height: 0 })
    let ready = $state(false)

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
</script>

<!-- A column on wide screens, an even row on tablets, an icon bar in the bottom row on phones -->
<div bind:this={tablist} class={['tabs', ready && 'ready']} role="tablist" aria-label="Settings sections" tabindex="-1" onkeydown={step}>
    <span class="indicator" style:--x="{indicator.x}px" style:--y="{indicator.y}px" style:--width="{indicator.width}px" style:--height="{indicator.height}px"></span>
    {#each sections as item (item.id)}
        <button
            role="tab"
            data-tab={item.id}
            class={['tab', current === item.id && 'active']}
            aria-selected={current === item.id}
            aria-controls={item.id}
            tabindex={current === item.id ? 0 : -1}
            onclick={() => onpick(item.id)}
        >
            <item.icon class="icon size-5 shrink-0" strokeWidth={1.75} />
            <span class="max-sm:sr-only">{item.label}</span>
        </button>
    {/each}
</div>

<style>
    /* On phones they share the bottom row with the rail's menu button, at its height */
    .tabs {
        position: fixed;
        right: var(--layout-content-gutter);
        bottom: var(--layout-bottom-row);
        left: calc(var(--layout-content-gutter) + var(--layout-menu-button) + 0.5rem);
        z-index: 30;
        display: flex;
        height: var(--layout-menu-button);
        padding: 0.375rem;
        border: 1px solid var(--theme-line-strong);
        border-radius: 999px;
        background: var(--theme-raised);
        outline: none;
    }

    @media (width >= 40rem) {
        .tabs {
            position: relative;
            inset: auto;
            z-index: auto;
            gap: 0.25rem;
            height: auto;
            padding: 0;
            border: 0;
            border-radius: 0;
            background: none;
        }
    }

    @media (width >= 64rem) {
        .tabs {
            flex-direction: column;
            align-self: start;
            padding-top: var(--peek);
        }
    }

    .tab {
        position: relative;
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        gap: 0.25rem;
        align-items: center;
        justify-content: center;
        min-width: 0;
        border-radius: 999px;
        color: var(--theme-ink-muted);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    @media (width >= 40rem) {
        .tab {
            padding: 0.5rem 0.25rem;
            border-radius: var(--layout-radius-control);
            font-size: 0.75rem;
        }
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

    .tab:hover {
        color: var(--theme-ink);
        background: var(--theme-line);
    }

    /* Takes on the colour in step with the indicator gliding in */
    .tab.active {
        color: var(--theme-on-accent);
        background: transparent;
        transition: color var(--duration-base) var(--ease-in-out);
    }

    /* Until the indicator knows its place the tab paints itself */
    .tabs:not(.ready) .tab.active {
        background: var(--theme-accent);
    }

    .tab :global(.icon) {
        transition: scale var(--duration-base) var(--ease-spring);
    }

    .tab:hover :global(.icon),
    .tab.active :global(.icon) {
        scale: 1.08;
    }

    .tab:active :global(.icon) {
        scale: 0.88;
    }

    .indicator {
        position: absolute;
        top: 0;
        left: 0;
        width: var(--width);
        height: var(--height);
        border-radius: 999px;
        background: var(--theme-accent);
        translate: var(--x) var(--y);
        opacity: 0;
    }

    @media (width >= 40rem) {
        .indicator {
            border-radius: var(--layout-radius-control);
        }
    }

    .tabs.ready .indicator {
        opacity: 1;
        transition: translate var(--duration-base) var(--ease-emphasized), width var(--duration-base) var(--ease-emphasized), height var(--duration-base) var(--ease-emphasized);
    }
</style>
