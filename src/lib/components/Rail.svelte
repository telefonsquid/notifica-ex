<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { safeAction } from '#lib/pocketbase.ts';
    import { disconnectRealtime } from '#lib/realtime.ts';
    import { LogOut, Settings, StickyNote } from '@lucide/svelte';
    import { logoutUser } from '../../routes/api/auth.remote';

    const NOTES = resolve('/(app)')

    function isActive(href: string): boolean {
        if(href === NOTES) return page.url.pathname === href
        return page.url.pathname.startsWith(href)
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

{#snippet link(route: '/(app)' | '/(app)/settings', label: string, Icon: typeof Settings)}
    {@const active = isActive(resolve(route))}
    <a href={resolve(route)} class={['item', active && 'active']} aria-label={label} aria-current={active ? 'page' : undefined}>
        {#if active}<span class="vt-rail-indicator indicator absolute inset-0 rounded-card bg-accent"></span>{/if}
        <Icon class="icon relative size-6" strokeWidth={1.75} />
        <span class="tip type-meta" aria-hidden="true">{label}</span>
    </a>
{/snippet}

<!-- Bottom bar on phones, side rail from sm up -->
<nav class="vt-rail fixed inset-x-0 bottom-0 z-40 flex h-20 items-center justify-around bg-canvas/80 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:inset-y-0 sm:right-auto sm:h-auto sm:w-rail sm:flex-col sm:justify-start sm:gap-2 sm:bg-transparent sm:px-0 sm:py-6 sm:backdrop-blur-none">

    <!-- MAIN -->
    {@render link('/(app)', 'Notes', StickyNote)}

    <!-- ACCOUNT | settings carry the user admin too -->
    <div class="contents sm:mt-auto sm:flex sm:flex-col sm:gap-2">
        {@render link('/(app)/settings', 'Settings', Settings)}
        <button class="item" aria-label="Logout" disabled={loggingOut} onclick={logout}>
            <LogOut class="icon relative size-6" strokeWidth={1.75} />
            <span class="tip type-meta" aria-hidden="true">Logout</span>
        </button>
    </div>

</nav>

<style>
    .item {
        position: relative;
        display: grid;
        place-items: center;
        width: 3.5rem;
        height: 3.5rem;
        border-radius: var(--layout-radius-card);
        color: var(--theme-ink-faint);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .item:hover {
        color: var(--theme-ink);
        background: var(--theme-line);
    }

    .item:active {
        scale: 0.92;
    }

    .item:disabled {
        opacity: 0.5;
    }

    .item.active {
        color: var(--theme-on-accent);
        background: transparent;
    }

    /* Icons tilt a little on hover and spring back */
    .item :global(.icon) {
        transition: rotate var(--duration-base) var(--ease-spring), scale var(--duration-base) var(--ease-spring);
    }

    .item:hover :global(.icon) {
        rotate: -8deg;
        scale: 1.08;
    }

    /* LABEL | slides out of the rail on hover, phones have no hover and never show it */
    .tip {
        position: absolute;
        left: calc(100% + 0.75rem);
        padding: 0.5rem 0.75rem;
        border-radius: var(--layout-radius-control);
        background: var(--theme-raised);
        color: var(--theme-ink);
        white-space: nowrap;
        box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.5);
        pointer-events: none;
        opacity: 0;
        translate: -0.5rem 0;
        transition: opacity var(--duration-fast) var(--ease-out), translate var(--duration-base) var(--ease-spring);
    }

    @media (hover: hover) and (min-width: 40rem) {
        .item:hover .tip,
        .item:focus-visible .tip {
            opacity: 1;
            translate: 0 0;
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
