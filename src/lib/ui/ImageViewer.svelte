<script lang="ts">
    import { duration, easing } from '#lib/motion.ts';
    import { viewer } from '#lib/singletons/image_viewer.svelte.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { ChevronLeft, ChevronRight, ExternalLink, X } from '@lucide/svelte';
    import { Dialog } from 'bits-ui';
    import { fade } from 'svelte/transition';

    /*
        Fullscreen view of a note's images, mounted once in the root layout. Opens with showImages().
        The image grows out of its spot on the card and shrinks back there on close.
    */

    let image = $derived(viewer.images[viewer.index])
    let several = $derived(viewer.images.length > 1)
    let loadedSrc = $state('')
    let loaded = $derived(loadedSrc === image?.src)
    let stepping = false                                        // paging crossfades, only opening and closing zoom

    // Opening and closing always zoom, whatever paged before
    $effect.pre(() => {
        void viewer.open
        stepping = false
    })

    // NAVIGATION
    function go(step: number){
        if(!several) return
        stepping = true
        viewer.index = (viewer.index + step + viewer.images.length) % viewer.images.length
    }

    function keys(event: KeyboardEvent){
        if(!viewer.open) return
        if(event.key === 'ArrowLeft') go(-1)
        if(event.key === 'ArrowRight') go(1)
    }

    // A horizontal swipe pages on touch screens
    let swipe: { x: number, y: number } | null = null

    function swipeStart(event: PointerEvent){
        if(event.pointerType === 'touch') swipe = { x: event.clientX, y: event.clientY }
    }

    function swipeEnd(event: PointerEvent){
        if(!swipe) return
        const dx = event.clientX - swipe.x
        const dy = event.clientY - swipe.y
        swipe = null
        if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
    }

    // The card's image hides while the viewer holds it, so it reads as one image lifted out
    let hidden: HTMLElement | undefined

    function reveal(){
        if(hidden) hidden.style.visibility = ''
        hidden = undefined
    }

    // Corner radii of the card's image, only where its cell meets a corner of the gallery
    function radii(cell: HTMLElement, rect: DOMRect){
        const gallery = cell.parentElement
        if(!gallery) return [0, 0, 0, 0]
        const outer = gallery.getBoundingClientRect()
        const style = getComputedStyle(gallery)
        const near = (a: number, b: number) => Math.abs(a - b) < 1.5
        const top = near(rect.top, outer.top), bottom = near(rect.bottom, outer.bottom)
        const left = near(rect.left, outer.left), right = near(rect.right, outer.right)
        return [
            top && left ? parseFloat(style.borderTopLeftRadius) : 0,
            top && right ? parseFloat(style.borderTopRightRadius) : 0,
            bottom && right ? parseFloat(style.borderBottomRightRadius) : 0,
            bottom && left ? parseFloat(style.borderBottomLeftRadius) : 0
        ]
    }

    // TRANSITION | the frame starts over the card's image, cropped like it, and grows into place
    function zoom(node: HTMLElement){
        const origin = image?.origin
        if(stepping || !origin?.isConnected){
            reveal()
            return fade(node, { duration: duration('base') })
        }

        const shown = origin.querySelector<HTMLImageElement>('img.shown') ?? origin
        const from = shown.getBoundingClientRect()
        const to = node.getBoundingClientRect()
        const cropped = getComputedStyle(shown).objectFit === 'cover'
        const corners = radii(origin, from)

        // A cropped image covers its box, a whole one fits inside it
        const scale = (cropped ? Math.max : Math.min)(from.width / to.width, from.height / to.height)
        const dx = from.left + from.width / 2 - (to.left + to.width / 2)
        const dy = from.top + from.height / 2 - (to.top + to.height / 2)

        // Clip in the frame's own unscaled pixels, matching the card's crop at the start
        const insetX = cropped ? Math.max(0, (to.width - from.width / scale) / 2) : 0
        const insetY = cropped ? Math.max(0, (to.height - from.height / scale) / 2) : 0

        hidden = origin
        origin.style.visibility = 'hidden'

        return {
            duration: duration('slow'),
            easing: easing('emphasized'),
            css: (t: number, u: number) => {
                const s = scale + (1 - scale) * t
                const round = corners.map((r) => `${(r / s) * u}px`).join(' ')
                return `transform: translate(${dx * u}px, ${dy * u}px) scale(${s}); clip-path: inset(${insetY * u}px ${insetX * u}px round ${round})`
            },
            tick: (t: number) => {
                if(t === 0 && !viewer.open) reveal()
            }
        }
    }
</script>

<svelte:window onkeydown={keys} />

<Dialog.Root bind:open={viewer.open}>
    <Dialog.Portal>
        <Dialog.Content forceMount>
            {#snippet child({ props, open })}
                {#if open && image}
                    <div {...props} class="viewer fixed inset-0 z-[80] grid place-items-center outline-none" onpointerdown={swipeStart} onpointerup={swipeEnd}>
                        <Dialog.Title class="sr-only">Image {viewer.index + 1} of {viewer.images.length}</Dialog.Title>

                        <!-- BACKDROP | a click anywhere off the image closes -->
                        <button class="scrim absolute inset-0 cursor-default" tabindex="-1" aria-hidden="true" onclick={() => viewer.open = false} transition:fade={{ duration: duration('slow'), easing: easing('emphasized') }}></button>

                        {#key viewer.index}
                            <figure class="frame relative" style:--ratio={image.ratio} transition:zoom|global>
                                <img src={image.preview} alt="" class="absolute inset-0 size-full object-contain" />
                                <img src={image.src} alt="" class={['full absolute inset-0 size-full object-contain', loaded && 'loaded']} onload={(event) => loadedSrc = event.currentTarget.getAttribute('src') ?? ''} />
                            </figure>
                        {/key}

                        <!-- CONTROLS -->
                        <div class="bar absolute inset-x-0 top-0 flex items-center gap-1 p-3" transition:fade={{ duration: duration('base') }}>
                            {#if several}<span class="type-meta px-2 text-white/70">{viewer.index + 1} / {viewer.images.length}</span>{/if}
                            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the image url is resolved already -->
                            <a class="control ml-auto" href={image.src} target="_blank" rel="noopener" aria-label="Open original" {@attach tip('Open original')}>
                                <ExternalLink class="size-4.5" />
                            </a>
                            <Dialog.Close class="control" aria-label="Close">
                                <X class="size-5" />
                            </Dialog.Close>
                        </div>

                        {#if several}
                            <button class="control step absolute left-3" aria-label="Previous image" onclick={() => go(-1)} {@attach tip('Previous')} transition:fade={{ duration: duration('base') }}>
                                <ChevronLeft class="size-5" />
                            </button>
                            <button class="control step absolute right-3" aria-label="Next image" onclick={() => go(1)} {@attach tip('Next')} transition:fade={{ duration: duration('base') }}>
                                <ChevronRight class="size-5" />
                            </button>
                        {/if}
                    </div>
                {/if}
            {/snippet}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    .scrim {
        background: rgb(0 0 0 / 0.86);
        backdrop-filter: blur(6px);
    }

    /* Sized from the ratio alone, so the zoom knows where it lands before the image loads */
    .frame {
        grid-area: 1 / 1;
        aspect-ratio: var(--ratio);
        width: min(calc(100vw - 2rem), calc((100dvh - 8rem) * var(--ratio)));
        pointer-events: none;
        will-change: transform;
    }

    .full {
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-out);
    }

    .full.loaded {
        opacity: 1;
    }

    /* Global since Dialog.Close renders the element itself */
    .viewer :global(.control) {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 9999px;
        color: white;
        background: rgb(255 255 255 / 0.08);
        transition: background-color var(--duration-fast) var(--ease-out);
    }

    .viewer :global(.control:hover),
    .viewer :global(.control:focus-visible) {
        background: rgb(255 255 255 / 0.2);
    }

    .step {
        top: 50%;
        translate: 0 -50%;
    }
</style>
