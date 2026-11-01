<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { safeAction } from '#lib/pocketbase.ts';
    import { disconnectRealtime, onCollectionChange } from '#lib/realtime.ts';
    import { VIEW_ICON_COMPONENTS } from '#lib/view_icons.ts';
    import { LogOut, Menu, Settings } from '@lucide/svelte';
    import { DropdownMenu } from 'bits-ui';
    import { logoutUser } from '../../routes/api/auth.remote';
    import { getViews } from '../../routes/api/views.remote';

    // VIEWS | set up in settings, the first one lives at the root
    let views = $derived(await getViews())

    $effect(() => onCollectionChange('views', () => getViews().refresh()))

    let openView = $derived(page.route.id === '/(app)/[[view]]' ? (page.params.view ?? views[0]?.id) : null)
    let inSettings = $derived(page.url.pathname.startsWith(resolve('/(app)/settings')))

    // TOOLTIP | fixed to the window, so the scrolling view list never clips it
    function tipAnchor(node: HTMLElement){
        const place = () => {
            const box = node.getBoundingClientRect()
            node.style.setProperty('--tip-y', `${box.top + box.height / 2}px`)
        }
        node.addEventListener('pointerenter', place)
        node.addEventListener('focus', place)
        return () => {
            node.removeEventListener('pointerenter', place)
            node.removeEventListener('focus', place)
        }
    }

    // LOGOUT | realtime goes first, the next account on this device must not get these events
    let loggingOut = $state(false)
    async function logout(){
        loggingOut = true
        const done = await safeAction(logoutUser())
        if(done){
            disconnectRealtime()
            await goto(resolve('/login'), { refreshAll: true })
        }
        loggingOut = false
    }
</script>

<!-- A view id of undefined is the root | settings take no view at all -->
{#snippet link(target: { view?: string } | 'settings', label: string, Icon: typeof Settings, active: boolean)}
    <a href={target === 'settings' ? resolve('/(app)/settings') : resolve('/(app)/[[view]]', target)} {@attach tipAnchor} class={['item', active && 'active']} aria-label={label} aria-current={active ? 'page' : undefined}>
        {#if active}<span class="vt-rail-indicator indicator absolute inset-0 rounded-card bg-accent"></span>{/if}
        <!-- Hover tilts the icon inside, Firefox drops the new snapshot of a tilted element mid transition -->
        <span class="vt-rail-icon relative flex size-6"><Icon class="icon size-6" strokeWidth={1.75} /></span>
        <span class="tip type-meta" aria-hidden="true">{label}</span>
    </a>
{/snippet}

<!-- A menu button in the bottom bar on phones, side rail from sm up -->
<nav class="vt-rail fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-gutter z-40 flex items-center gap-2 sm:inset-y-0 sm:left-0 sm:w-rail sm:flex-col sm:py-6">

    <!-- MENU | everything the rail holds, tucked away on phones -->
    <DropdownMenu.Root>
        <DropdownMenu.Trigger class="motion-interactive grid size-12 place-items-center rounded-full border border-line bg-raised/85 text-ink-muted shadow-xl backdrop-blur-xl hover:text-ink sm:hidden" aria-label="Menu">
            <Menu class="size-5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
            <DropdownMenu.Content class="menu max-h-[var(--bits-dropdown-menu-content-available-height)] overflow-y-auto" side="top" align="start" sideOffset={10} collisionPadding={12}>
                {#each views as view, index (view.id)}
                    {@const Icon = VIEW_ICON_COMPONENTS[view.icon]}
                    <DropdownMenu.Item class={['menu-item', openView === view.id && 'current']} onSelect={() => goto(resolve('/(app)/[[view]]', { view: index === 0 ? undefined : view.id }))}>
                        <Icon class="size-4" />{view.name}
                    </DropdownMenu.Item>
                {/each}
                <DropdownMenu.Separator class="menu-separator" />
                <DropdownMenu.Item class={['menu-item', inSettings && 'current']} onSelect={() => goto(resolve('/(app)/settings'))}>
                    <Settings class="size-4" />Settings
                </DropdownMenu.Item>
                <DropdownMenu.Item class="menu-item" disabled={loggingOut} onSelect={logout}>
                    <LogOut class="size-4" />Logout
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Portal>
    </DropdownMenu.Root>

    <!-- VIEWS | scroll once there are more than fit -->
    <div class="views hidden min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto sm:flex">
        <!-- Unkeyed on purpose, a keyed list froze the page on its second reorder -->
        <!-- eslint-disable-next-line svelte/require-each-key -->
        {#each views as view, index}
            {@render link({ view: index === 0 ? undefined : view.id }, view.name, VIEW_ICON_COMPONENTS[view.icon], openView === view.id)}
        {/each}
    </div>

    <!-- ACCOUNT | settings carry the user admin too -->
    <div class="hidden shrink-0 flex-col items-center gap-2 sm:flex">
        {@render link('settings', 'Settings', Settings, inSettings)}
        <button class="item" {@attach tipAnchor} aria-label="Logout" disabled={loggingOut} onclick={logout}>
            <LogOut class="icon relative size-6" strokeWidth={1.75} />
            <span class="tip type-meta" aria-hidden="true">Logout</span>
        </button>
    </div>

</nav>

<style>
    .views {
        scrollbar-width: none;
    }

    /* The open view stands out in the phone menu */
    :global(.menu-item.current) {
        color: var(--theme-accent);
    }

    .item {
        position: relative;
        display: grid;
        flex-shrink: 0;
        place-items: center;
        width: 3.5rem;
        height: 3.5rem;
        border-radius: var(--layout-radius-card);
        color: var(--theme-ink-faint);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .item:hover {
        color: var(--theme-ink);
        background: var(--theme-line);
    }

    .item:disabled {
        opacity: 0.5;
    }

    /* Takes on the colour in step with the indicator gliding in */
    .item.active {
        color: var(--theme-on-accent);
        background: transparent;
        transition: color var(--duration-base) var(--ease-in-out);
    }

    /* Icons tilt a little on hover and spring back | the press squeezes the icon, scaling the item would move the fixed tooltip */
    .item :global(.icon) {
        transition: rotate var(--duration-base) var(--ease-spring), scale var(--duration-base) var(--ease-spring);
    }

    .item:hover :global(.icon) {
        rotate: -8deg;
        scale: 1.08;
    }

    .item:active :global(.icon) {
        scale: 0.88;
    }

    /* LABEL | slides out of the rail on hover, phones have no hover and never show it */
    .tip {
        position: fixed;
        top: var(--tip-y, 0);
        left: calc(var(--layout-rail-width) + 0.25rem);
        z-index: 1;
        padding: 0.5rem 0.75rem;
        border-radius: var(--layout-radius-control);
        background: var(--theme-raised);
        color: var(--theme-ink);
        white-space: nowrap;
        box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.5);
        pointer-events: none;
        opacity: 0;
        translate: -0.5rem -50%;
        transition: opacity var(--duration-fast) var(--ease-out), translate var(--duration-base) var(--ease-spring);
    }

    @media (hover: hover) and (min-width: 40rem) {
        .item:hover .tip,
        .item:focus-visible .tip {
            opacity: 1;
            translate: 0 -50%;
        }
    }

    /* Fallback for browsers without view transitions, there the indicator pops in place instead of gliding */
    @supports not (view-transition-name: none) {
        .indicator {
            animation: indicator-in var(--duration-slow) var(--ease-spring) both;
        }
    }

    @keyframes indicator-in {
        from { opacity: 0; scale: 0.5; }
    }
</style>
