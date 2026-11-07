<script lang="ts">
    import { afterNavigate, goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import ViewMenu from '#lib/components/ViewMenu.svelte';
    import { duration, easing, rise, stagger } from '#lib/motion.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { stopDeviceNotifications } from '#lib/device_notifications.ts';
    import { disconnectRealtime, onCollectionChange } from '#lib/realtime.ts';
    import { viewIcon } from '#lib/view_icons.ts';
    import { LogOut, Menu, Settings, X } from '@lucide/svelte';
    import { ContextMenu, Dialog } from 'bits-ui';
    import { finishRemovals } from '#lib/deletions.ts';
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

    // LOGOUT | the next account on this device must not get these events or reminders
    // Notifications stop before the session ends, unsubscribing needs it
    let loggingOut = $state(false)
    async function logout(){
        loggingOut = true
        await safeAction(stopDeviceNotifications())
        await finishRemovals()
        const done = await safeAction(logoutUser())
        if(done){
            disconnectRealtime()
            await goto(resolve('/login'), { refreshAll: true })
        }
        loggingOut = false
    }

    // PHONE MENU | the rail spread over the whole screen, names shown
    let menuOpen = $state(false)
    let menuButton = $state<HTMLElement | null>(null)

    afterNavigate(() => menuOpen = false)

    // Grows as a circle out of the menu button and shrinks back into it
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Svelte hands every transition its node
    function spread(_node: Element){
        const box = menuButton?.getBoundingClientRect()
        const x = box ? box.left + box.width / 2 : 0
        const y = box ? box.top + box.height / 2 : innerHeight
        const from = (box?.width ?? 0) / 2
        const to = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

        return {
            duration: duration('slow'),
            easing: easing('emphasized'),
            css: (t: number) => `clip-path: circle(${from + (to - from) * t}px at ${x}px ${y}px)`
        }
    }
</script>

<!-- A view id of undefined is the root | settings take no view at all | props come from a menu trigger -->
{#snippet link(target: { view?: string } | 'settings', label: string, Icon: typeof Settings, active: boolean, props: Record<string, unknown> = {})}
    <a {...props} href={target === 'settings' ? resolve('/(app)/settings') : resolve('/(app)/[[view]]', target)} {@attach tipAnchor} class={['item', active && 'active']} aria-label={label} aria-current={active ? 'page' : undefined}>
        {#if active}<span class="vt-rail-indicator indicator absolute inset-0 rounded-card bg-accent"></span>{/if}
        <!-- Hover tilts the icon inside, Firefox drops the new snapshot of a tilted element mid transition -->
        <span class="vt-rail-icon relative flex size-6"><Icon class="icon size-6" strokeWidth={1.75} /></span>
        <span class="tip type-meta" aria-hidden="true">{label}</span>
    </a>
{/snippet}

<!-- A rail item with its name beside it, for the phone menu -->
{#snippet entry(href: string, label: string, Icon: typeof Settings, active: boolean, index: number, props: Record<string, unknown> = {})}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the caller -->
    <a {...props} {href} class={['entry', active && 'active']} aria-current={active ? 'page' : undefined} in:rise|global={{ y: 16, delay: stagger(index), duration: 'base' }}>
        <Icon class="size-6 shrink-0" strokeWidth={1.75} />
        <span class="type-title truncate text-lg">{label}</span>
    </a>
{/snippet}

<!-- A menu button in the bottom bar on phones, side rail from sm up -->
<nav class="vt-rail fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-gutter z-40 flex items-center gap-2 sm:inset-y-0 sm:left-0 sm:w-rail sm:flex-col sm:pt-[calc(1.5rem+env(safe-area-inset-top))] sm:pb-6">

    <!-- MENU | everything the rail holds, spread over the screen on phones -->
    <Dialog.Root bind:open={menuOpen}>
        <Dialog.Trigger bind:ref={menuButton} class="menu-button grid size-16 shrink-0 place-items-center rounded-full border border-line-strong bg-raised text-ink sm:hidden" aria-label="Menu">
            <Menu class="size-7" strokeWidth={2.25} />
        </Dialog.Trigger>
        <Dialog.Portal>
            <!-- No scroll lock, restyling the body lays out the whole grid on the first frame | the menu contains its own overscroll -->
            <Dialog.Content forceMount preventScroll={false}>
                {#snippet child({ props, open })}
                    {#if open}
                        <div {...props} class="phone-menu fixed inset-0 z-[60] flex flex-col justify-end overflow-y-auto overscroll-contain bg-canvas/95 px-gutter pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none sm:hidden" transition:spread>
                            <Dialog.Title class="sr-only">Menu</Dialog.Title>

                            <nav class="flex flex-col gap-1">
                                {#each views as view, index (view.id)}
                                    {@const Icon = viewIcon(view.icon)}
                                    <ContextMenu.Root>
                                        <ContextMenu.Trigger>
                                            {#snippet child({ props })}
                                                {@render entry(resolve('/(app)/[[view]]', { view: index === 0 ? undefined : view.id }), view.name, Icon, openView === view.id, index, props)}
                                            {/snippet}
                                        </ContextMenu.Trigger>
                                        <ContextMenu.Portal>
                                            <ContextMenu.Content class="menu z-[70]" collisionPadding={12}>
                                                <ViewMenu {view} {views} current={openView === view.id} />
                                            </ContextMenu.Content>
                                        </ContextMenu.Portal>
                                    </ContextMenu.Root>
                                {/each}
                                <hr class="my-3 border-line" />
                                {@render entry(resolve('/(app)/settings'), 'Settings', Settings, inSettings, views.length)}
                                <button class="entry" disabled={loggingOut} onclick={logout} in:rise|global={{ y: 16, delay: stagger(views.length + 1), duration: 'base' }}>
                                    <LogOut class="size-6 shrink-0" strokeWidth={1.75} />
                                    <span class="type-title text-lg">Logout</span>
                                </button>
                            </nav>

                            <!-- Sits right over the menu button, so the button seems to turn into a cross -->
                            <Dialog.Close class="menu-button absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-gutter grid size-16 place-items-center rounded-full border border-line-strong bg-raised text-ink" aria-label="Close menu">
                                <X class="size-7" strokeWidth={2.25} />
                            </Dialog.Close>
                        </div>
                    {/if}
                {/snippet}
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>

    <!-- VIEWS | scroll once there are more than fit -->
    <div class="views hidden min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto sm:flex">
        <!-- Unkeyed on purpose, a keyed list froze the page on its second reorder -->
        <!-- eslint-disable-next-line svelte/require-each-key -->
        {#each views as view, index}
            <ContextMenu.Root>
                <ContextMenu.Trigger>
                    {#snippet child({ props })}
                        {@render link({ view: index === 0 ? undefined : view.id }, view.name, viewIcon(view.icon), openView === view.id, props)}
                    {/snippet}
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                    <ContextMenu.Content class="menu" collisionPadding={12}>
                        <ViewMenu {view} {views} current={openView === view.id} />
                    </ContextMenu.Content>
                </ContextMenu.Portal>
            </ContextMenu.Root>
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

    /* MENU BUTTON | as big and heavy as the create button on the other side */
    :global(.menu-button) {
        box-shadow: 0 0.75rem 1.75rem -0.75rem rgb(0 0 0 / 0.35);
        transition: scale var(--duration-base) var(--ease-spring), background-color var(--duration-fast) var(--ease-out);
    }

    :global(.menu-button:hover),
    :global(.menu-button:focus-visible) {
        scale: 1.06;
    }

    :global(.menu-button:active) {
        scale: 0.92;
    }

    /* PHONE MENU | rail items laid out wide, the open one filled with the accent */
    .entry {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-height: 3.5rem;
        padding: 0 1.25rem;
        border-radius: var(--layout-radius-card);
        color: var(--theme-ink-muted);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .entry:hover {
        color: var(--theme-ink);
        background: var(--theme-line);
    }

    .entry.active {
        color: var(--theme-on-accent);
        background: var(--theme-accent);
    }

    .entry:disabled {
        opacity: 0.5;
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
        .item:not([data-state='open']):hover .tip,
        .item:not([data-state='open']):focus-visible .tip {
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
