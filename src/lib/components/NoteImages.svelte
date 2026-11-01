<script lang="ts">
    import { imageUrl } from '#lib/images.ts';
    import { rise, unfold } from '#lib/motion.ts';
    import { showImages } from '#lib/singletons/image_viewer.svelte.ts';
    import { Expand, X } from '@lucide/svelte';

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
    let cells: HTMLElement[] = $state([])

    // Hands every stored image to the viewer, each with the cell it grows out of
    function view(index: number){
        if(!note) return
        showImages(images.map((name, i) => {
            const shown = cells[i]?.querySelector<HTMLImageElement>('img.shown')
            return {
                src: imageUrl(note, name, 'full'),
                preview: imageUrl(note, name),
                ratio: shown?.naturalWidth && shown.naturalHeight ? shown.naturalWidth / shown.naturalHeight : 1,
                origin: cells[i]
            }
        }), index)
    }
</script>

{#if count}
    <div class={['gallery relative -mx-card -mt-card grid gap-0.5 overflow-hidden', alone && 'alone -mb-card', count === 1 && 'single', !editable && 'pointer-events-none']} style:grid-template-columns={`repeat(${columns}, minmax(0, 1fr))`} in:rise={{ y: 0, scale: 1, duration: 'base' }} out:unfold>
        {#each images as name, index (name)}
            {@const src = note ? imageUrl(note, name) : undefined}
            <figure bind:this={cells[index]} class={['cell relative overflow-hidden', columns > 1 && 'aspect-square']}>
                <!-- A blurred copy fills the room around an image shown whole -->
                <img {src} alt="" aria-hidden="true" loading="lazy" decoding="async" class="ambient absolute inset-0 size-full object-cover" />

                <!-- Opens the viewer, only while open since the closed card is one big button -->
                <button class="block size-full cursor-zoom-in" tabindex={editable ? 0 : -1} aria-label="View image" onclick={() => view(index)}>
                    <img {src} alt="" loading="lazy" decoding="async" class="shown relative size-full object-cover" />
                </button>

                {#if editable}
                    <div class="controls absolute top-2 right-2 flex gap-1.5">
                        <button class="control" aria-label="View whole image" onclick={() => view(index)}>
                            <Expand class="size-3.5" />
                        </button>
                        <button class="control" aria-label="Remove image" onclick={() => onremove(name)}>
                            <X class="size-4" />
                        </button>
                    </div>
                {/if}
            </figure>
        {/each}
        {#each uploads as upload (upload.key)}
            <figure class={['cell uploading relative overflow-hidden', columns > 1 && 'aspect-square']}>
                <img src={upload.url} alt="" aria-hidden="true" class="ambient absolute inset-0 size-full object-cover" />
                <img src={upload.url} alt="" class="shown relative size-full object-cover" />
            </figure>
        {/each}

        <!-- A closed card lets clicks through to open it, only this button takes them -->
        {#if !editable && images.length}
            <button class="control closed-view pointer-events-auto absolute top-2 right-2" aria-label="View whole image" onpointerdown={(event) => event.stopPropagation()} onclick={() => view(0)}>
                <Expand class="size-3.5" />
            </button>
        {/if}
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
    .single .shown {
        max-height: 24rem;
    }

    /* WHOLE | the device setting shows every image uncropped, its blurred copy fills the sides */
    .ambient {
        display: none;
        filter: blur(18px) saturate(1.3);
        scale: 1.25;
        opacity: 0.85;
    }

    :global(html[data-images='whole']) .ambient {
        display: block;
    }

    :global(html[data-images='whole']) .shown {
        object-fit: contain;
    }

    .uploading img {
        animation: pulse 1s var(--ease-in-out) infinite alternate;
    }

    @keyframes pulse {
        from { opacity: 0.85; }
        to { opacity: 0.45; }
    }

    /* CONTROLS | appear on hover, always there where nothing hovers */
    .control {
        display: grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 9999px;
        color: white;
        background: rgb(0 0 0 / 0.45);
        backdrop-filter: blur(4px);
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .cell:hover .control,
    :global(:hover) > .gallery .closed-view,
    .control:focus-visible {
        opacity: 1;
    }

    .control:hover {
        background: rgb(0 0 0 / 0.65);
    }

    @media (hover: none) {
        .control {
            opacity: 1;
        }
    }
</style>
