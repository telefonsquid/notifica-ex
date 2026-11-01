<script lang="ts">
    import { imageUrl } from '#lib/images.ts';
    import { rise, unfold } from '#lib/motion.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { X } from '@lucide/svelte';

    /*
        The images on top of a note, edge to edge. One shows whole, more share a grid of squares.
        Uploads still on their way show as local previews.
    */

    // PROPS
    let {
        note,
        images,
        uploads,
        editable = false,
        alone = false,
        onremove
    }: {
        note: string | undefined
        images: string[]
        uploads: { key: string, url: string }[]
        editable?: boolean
        alone?: boolean                                         // nothing else on the card, the images fill it to every edge
        onremove: (name: string) => void
    } = $props()

    let count = $derived(images.length + uploads.length)
    let columns = $derived(count === 1 ? 1 : count === 2 || count === 4 ? 2 : 3)
</script>

{#if count}
    <div class={['gallery -mx-card -mt-card grid gap-0.5 overflow-hidden', alone && 'alone -mb-card', !editable && 'pointer-events-none']} style:grid-template-columns={`repeat(${columns}, minmax(0, 1fr))`} in:rise={{ y: 0, scale: 1, duration: 'base' }} out:unfold>
        {#each images as name (name)}
            <figure class={['cell relative', columns > 1 && 'aspect-square']}>
                <!-- Full size in its own tab, only while open since the closed card is one big button -->
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- imageUrl() resolves it -->
                <a href={note ? imageUrl(note, name, 'full') : undefined} target="_blank" rel="noopener" tabindex={editable ? 0 : -1} class="block size-full">
                    <img src={note ? imageUrl(note, name) : undefined} alt="" loading="lazy" decoding="async" class="size-full object-cover" />
                </a>
                {#if editable}
                    <button class="remove absolute top-2 right-2 grid size-7 place-items-center rounded-full" aria-label="Remove image" onclick={() => onremove(name)} {@attach tip('Remove image')}>
                        <X class="size-4" />
                    </button>
                {/if}
            </figure>
        {/each}
        {#each uploads as upload (upload.key)}
            <figure class={['cell uploading relative', columns > 1 && 'aspect-square']}>
                <img src={upload.url} alt="" class="size-full object-cover" />
            </figure>
        {/each}
    </div>
{/if}

<style>
    /* Inner corners, one pixel smaller than the card's so the border stays visible around them */
    .gallery {
        border-radius: calc(var(--layout-radius-card) - 1px) calc(var(--layout-radius-card) - 1px) 0 0;
    }

    .gallery.alone {
        border-radius: calc(var(--layout-radius-card) - 1px);
    }

    .cell {
        background: var(--theme-line);
    }

    /* A single image keeps its shape but never fills the screen */
    .cell:only-child img {
        max-height: 24rem;
    }

    .uploading img {
        animation: pulse 1s var(--ease-in-out) infinite alternate;
    }

    @keyframes pulse {
        from { opacity: 0.85; }
        to { opacity: 0.45; }
    }

    .remove {
        color: white;
        background: rgb(0 0 0 / 0.45);
        backdrop-filter: blur(4px);
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .cell:hover .remove,
    .remove:focus-visible {
        opacity: 1;
    }

    .remove:hover {
        background: rgb(0 0 0 / 0.65);
    }
</style>
