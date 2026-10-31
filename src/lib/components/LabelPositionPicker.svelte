<script lang="ts">
    import { LABEL_POSITIONS, type LabelPosition } from '#lib/preferences.ts';
    import { Check } from '@lucide/svelte';
    import { setLabelPosition } from '../../routes/api/settings.remote';

    // PROPS
    let { current }: { current: LabelPosition } = $props()

    let selected = $derived(current) // Flips at once on click, the server value catches up after

    // Applies right away, the cookie only matters for the next page load
    function choose(position: LabelPosition){
        if(position === selected) return
        selected = position
        document.documentElement.dataset.labels = position
        setLabelPosition(position).catch(() => {})
    }
</script>

<div class="grid gap-note-gap sm:grid-cols-2">
    {#each LABEL_POSITIONS as position (position)}
        {@const active = selected === position}
        <button
            class={['option motion-interactive flex items-center gap-5 rounded-card border bg-card p-card text-left text-ink', active ? 'border-accent' : 'border-line hover:border-line-strong']}
            aria-pressed={active}
            onclick={() => choose(position)}
        >
            <!-- MINIATURE | a card with two tabs on the chosen edge -->
            <div class={['mini relative my-2 flex h-16 w-20 shrink-0 flex-col gap-1.5 rounded-control border border-line-strong p-2.5', position]} aria-hidden="true">
                <div class="mini-tabs absolute left-2.5 flex gap-1">
                    <span class="mini-tab note-mark w-5" data-note="tangerine-solid"></span>
                    <span class="mini-tab note-mark w-7" data-note="cobalt"></span>
                </div>
                <span class="h-1.5 w-3/4 rounded-full bg-ink-faint"></span>
                <span class="h-1 w-full rounded-full bg-line-strong"></span>
                <span class="h-1 w-2/3 rounded-full bg-line-strong"></span>
            </div>

            <span class="type-title flex-1 text-lg capitalize">{position}</span>
            <span class={['check grid size-7 place-items-center rounded-full bg-accent text-on-accent', !active && 'hidden-check']}>
                <Check class="size-4" strokeWidth={3} />
            </span>
        </button>
    {/each}
</div>

<style>
    .mini-tabs {
        bottom: 100%;
        align-items: end;
    }

    .mini.bottom .mini-tabs {
        top: 100%;
        bottom: auto;
        align-items: start;
    }

    .mini-tab {
        height: 0.1875rem;
        border-radius: 0.25rem 0.25rem 0 0;
        transition: height var(--duration-base) var(--ease-spring);
    }

    .mini.bottom .mini-tab {
        border-radius: 0 0 0.25rem 0.25rem;
    }

    /* Tabs open up on hover as they do on real cards */
    .option:hover .mini-tab {
        height: 0.5rem;
    }

    .check {
        transition: scale var(--duration-base) var(--ease-spring), opacity var(--duration-fast) var(--ease-out);
    }

    .hidden-check {
        scale: 0.4;
        opacity: 0;
    }
</style>
