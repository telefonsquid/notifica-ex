<script lang="ts">
    import { browser } from '$app/env';
    import { IMAGE_FITS, isImageFit, type ImageFit } from '#lib/preferences.ts';
    import { Check } from '@lucide/svelte';
    import { setImageFit } from '../../routes/api/settings.remote';

    // PROPS
    let { current }: { current: ImageFit } = $props()

    const NAMES: Record<ImageFit, string> = { cropped: 'Cropped', whole: 'Whole' }

    // The page attribute holds the latest choice, the load data keeps the value of the first page load
    let selected = $derived(browser && isImageFit(document.documentElement.dataset.images) ? document.documentElement.dataset.images : current)

    // Applies right away, the cookie only matters for the next page load
    function choose(fit: ImageFit){
        if(fit === selected) return
        selected = fit
        document.documentElement.dataset.images = fit
        setImageFit(fit).catch(() => {})
    }
</script>

<div class="grid gap-note-gap sm:grid-cols-2">
    {#each IMAGE_FITS as fit (fit)}
        {@const active = selected === fit}
        <button
            class={['option motion-interactive flex items-center gap-5 rounded-card border bg-card p-card text-left text-ink', active ? 'border-accent' : 'border-line hover:border-line-strong']}
            aria-pressed={active}
            onclick={() => choose(fit)}
        >
            <!-- MINIATURE | a card topped by a tall picture, cut or whole -->
            <div class={['mini relative my-2 flex h-16 w-20 shrink-0 flex-col overflow-hidden rounded-control border border-line-strong', fit]} aria-hidden="true">
                <div class="picture relative h-9 shrink-0 overflow-hidden">
                    <span class="ambient absolute inset-0"></span>
                    <span class="subject absolute left-1/2 -translate-x-1/2"></span>
                </div>
                <div class="flex flex-col gap-1 p-2">
                    <span class="h-1 w-3/4 rounded-full bg-ink-faint"></span>
                    <span class="h-1 w-1/2 rounded-full bg-line-strong"></span>
                </div>
            </div>

            <span class="type-title flex-1 text-lg">{NAMES[fit]}</span>
            <span class={['check grid size-7 place-items-center rounded-full bg-accent text-on-accent', !active && 'hidden-check']}>
                <Check class="size-4" strokeWidth={3} />
            </span>
        </button>
    {/each}
</div>

<style>
    /* A tall picture: sky on top, ground below, only its middle fits the cropped frame */
    .subject {
        background: linear-gradient(var(--theme-secondary) 0 45%, var(--theme-accent) 45% 100%);
    }

    .cropped .subject {
        top: -0.75rem;
        width: 100%;
        height: 3.75rem;
    }

    .whole .subject {
        top: 0;
        width: 1.35rem;
        height: 100%;
        transition: width var(--duration-base) var(--ease-spring);
    }

    .ambient {
        display: none;
        background: linear-gradient(var(--theme-secondary) 0 45%, var(--theme-accent) 45% 100%);
        filter: blur(4px);
        opacity: 0.55;
        scale: 1.3;
    }

    .whole .ambient {
        display: block;
    }

    .check {
        transition: scale var(--duration-base) var(--ease-spring), opacity var(--duration-fast) var(--ease-out);
    }

    .hidden-check {
        scale: 0.4;
        opacity: 0;
    }
</style>
