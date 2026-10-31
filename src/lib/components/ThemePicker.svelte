<script lang="ts">
    import { THEMES, type ThemeName } from '#lib/themes/index.ts';
    import { switchTheme } from '#lib/themes/switch.ts';
    import { Check } from '@lucide/svelte';

    // PROPS
    let { current }: { current: ThemeName } = $props()

    let selected = $derived(current) // Flips at once on click, the server value catches up after

    // REVEAL FROM THE POINTER | keyboard clicks report no position, those reveal from the center
    function choose(theme: ThemeName, event: MouseEvent){
        if(theme === selected) return
        selected = theme
        switchTheme(theme, event.detail === 0 ? undefined : { x: event.clientX, y: event.clientY })
    }
</script>

<div class="grid gap-note-gap sm:grid-cols-2">
    {#each THEMES as theme (theme.name)}
        {@const active = selected === theme.name}

        <!-- Each preview carries its own data-theme, so it renders with that theme's real tokens -->
        <button
            data-theme={theme.name}
            class={['preview motion-interactive group relative overflow-hidden rounded-card border bg-canvas p-card text-left text-ink', active ? 'border-accent' : 'border-line hover:border-line-strong']}
            aria-pressed={active}
            onclick={(event) => choose(theme.name, event)}
        >
            <!-- MINIATURE -->
            <div class="mb-5 flex h-28 gap-2" aria-hidden="true">
                <div class="flex w-6 flex-col items-center gap-1.5 rounded-control bg-card py-2">
                    <span class="size-2 rounded-full bg-accent"></span>
                    <span class="size-2 rounded-full bg-line-strong"></span>
                    <span class="size-2 rounded-full bg-line-strong"></span>
                </div>
                <div class="grid flex-1 grid-cols-3 gap-[calc(var(--layout-note-gap)/3)]">
                    {#each [0, 1, 2] as index (index)}
                        <div class="mini-note flex flex-col gap-1.5 rounded-[calc(var(--layout-radius-card)/2)] border border-line bg-card p-2" style:--index={index}>
                            <span class={['h-1.5 w-3/4 rounded-full', index === 1 ? 'bg-accent' : 'bg-ink-faint']}></span>
                            <span class="h-1 w-full rounded-full bg-line-strong"></span>
                            <span class="h-1 w-2/3 rounded-full bg-line-strong"></span>
                            {#if index !== 2}<span class="mt-auto h-3 w-8 rounded-full bg-secondary-soft"></span>{/if}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- LABEL -->
            <div class="flex items-center justify-between">
                <div>
                    <p class="type-title text-lg">{theme.label}</p>
                    <p class="type-meta text-ink-faint">{theme.scheme}</p>
                </div>
                <span class={['check grid size-7 place-items-center rounded-full bg-accent text-on-accent', !active && 'hidden-check']}>
                    <Check class="size-4" strokeWidth={3} />
                </span>
            </div>
        </button>
    {/each}
</div>

<style>
    /* Notes in the miniature shuffle up one after another on hover */
    .mini-note {
        transition: translate var(--duration-slow) var(--ease-spring);
        transition-delay: calc(var(--index) * 40ms);
    }

    .preview:hover .mini-note {
        translate: 0 -4px;
    }

    .check {
        transition: scale var(--duration-base) var(--ease-spring), opacity var(--duration-fast) var(--ease-out);
    }

    .hidden-check {
        scale: 0.4;
        opacity: 0;
    }
</style>
