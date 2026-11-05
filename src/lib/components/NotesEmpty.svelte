<script lang="ts">
    import { resolve } from '$app/paths';

    // PROPS
    let {
        gone,
        blank
    }: {
        gone: boolean       // The view itself does not exist
        blank: boolean      // No notes at all yet, not just none that match
    } = $props()
</script>

<section class="flex flex-col items-center pb-8 text-center">
    {#if gone}
        <h2 class="type-title mb-2 text-2xl text-ink">This view is gone</h2>
        <p class="max-w-xs text-ink-muted">It was deleted or never existed. <a href={resolve('/(app)/[[view]]', {})} class="text-accent hover:underline">Open the first view</a></p>
    {:else if blank}
        <!-- Three loose sheets that drift on their own and fan out on hover -->
        <div class="stack relative mb-12 h-44 w-40" aria-hidden="true">
            <div class="sheet sheet-back absolute inset-0 rounded-card border border-line bg-secondary-soft"></div>
            <div class="sheet sheet-mid absolute inset-0 rounded-card border border-line bg-card"></div>
            <div class="sheet sheet-front absolute inset-0 flex flex-col gap-2.5 rounded-card border border-line-strong bg-raised p-5">
                <span class="h-2.5 w-3/4 rounded-full bg-accent"></span>
                <span class="h-1.5 w-full rounded-full bg-line-strong"></span>
                <span class="h-1.5 w-5/6 rounded-full bg-line-strong"></span>
                <span class="h-1.5 w-2/3 rounded-full bg-line-strong"></span>
                <span class="mt-auto h-5 w-14 rounded-full bg-accent-soft"></span>
            </div>
        </div>
        <h2 class="type-title mb-2 text-2xl text-ink">Nothing here yet</h2>
        <p class="max-w-xs text-ink-muted">Notes, lists and reminders will gather here as soon as you write the first one.</p>
    {:else}
        <h2 class="type-title mb-2 text-2xl text-ink">Nothing matches</h2>
        <p class="max-w-xs text-ink-muted">Try another view or search, or loosen the filter.</p>
    {/if}
</section>

<style>
    .sheet {
        transition: translate var(--duration-slow) var(--ease-spring), rotate var(--duration-slow) var(--ease-spring);
    }

    .sheet-back { rotate: 9deg; translate: 18px -6px; }
    .sheet-mid { rotate: -6deg; translate: -14px 4px; }
    .sheet-front { animation: drift 7s var(--ease-in-out) infinite alternate; }

    .stack:hover .sheet-back { rotate: 18deg; translate: 46px -10px; }
    .stack:hover .sheet-mid { rotate: -14deg; translate: -44px 6px; }

    @keyframes drift {
        from { translate: 0 0; rotate: -1deg; }
        to { translate: 0 -8px; rotate: 1.5deg; }
    }

    @media (prefers-reduced-motion: reduce) {
        .sheet-front { animation: none; }
    }
</style>
