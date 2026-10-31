<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { safeAction } from '#lib/pocketbase.ts';
    import { disconnectRealtime } from '#lib/realtime.ts';
    import Logo from '#lib/ui/Logo.svelte';
    import { LogOut, Settings, StickyNote } from '@lucide/svelte';
    import { logoutUser } from '../../routes/api/auth.remote';

    const links = [
        { href: resolve('/(app)'), label: 'Notes', icon: StickyNote },
        { href: resolve('/(app)/settings'), label: 'Settings', icon: Settings },
    ]

    function isActive(href: string): boolean {
        if(href === resolve('/(app)')) return page.url.pathname === href
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

<!-- Bottom bar on phones, side rail from sm up -->
<nav class="vt-rail fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-line bg-canvas/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:inset-y-0 sm:right-auto sm:h-auto sm:w-rail sm:flex-col sm:justify-start sm:gap-1 sm:border-t-0 sm:border-r sm:pt-5 sm:pb-5">

    <!-- LOGO -->
    <a href={resolve('/(app)')} class="mb-6 hidden sm:block" aria-label="Notes">
        <Logo />
    </a>

    <!-- LINKS -->
    {#each links as link (link.href)}
        {@const active = isActive(link.href)}
        <a
            href={link.href}
            class={['item motion-interactive relative flex w-16 flex-col items-center gap-1 py-1.5', active ? 'text-ink' : 'text-ink-faint hover:text-ink-muted']}
            aria-current={active ? 'page' : undefined}
        >
            {#if active}
                <span class="vt-rail-indicator indicator absolute top-0.5 left-1/2 h-8 w-14 -translate-x-1/2 rounded-full bg-accent-soft"></span>
            {/if}
            <link.icon class={['icon relative size-5', active && 'text-accent']} />
            <span class="type-meta relative">{link.label}</span>
        </a>
    {/each}

    <!-- LOGOUT -->
    <button
        class="item motion-interactive relative flex w-16 flex-col items-center gap-1 py-1.5 text-ink-faint hover:text-ink-muted disabled:opacity-50 sm:mt-auto"
        disabled={loggingOut}
        onclick={logout}
    >
        <LogOut class="icon relative size-5" />
        <span class="type-meta relative">Logout</span>
    </button>

</nav>

<style>
    /* Icons lift a little on hover and spring back */
    .item :global(.icon) {
        transition: translate var(--duration-base) var(--ease-spring);
    }

    .item:hover :global(.icon) {
        translate: 0 -2px;
    }

    /* Fallback for browsers without view transitions, there the indicator pops in place instead of gliding */
    @supports not (view-transition-name: none) {
        .indicator {
            animation: indicator-in var(--duration-slow) var(--ease-spring) both;
        }
    }

    @keyframes indicator-in {
        from { opacity: 0; scale: 0.5 1; }
    }
</style>
