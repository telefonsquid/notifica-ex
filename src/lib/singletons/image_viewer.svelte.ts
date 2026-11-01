/*
    State of the one fullscreen image viewer in the root layout. Cards hand it their images
    and where each one sits, so the viewer can grow out of it and shrink back.
*/

export type ViewerImage = {
    src: string                         // full size
    preview: string                     // already loaded by the card, shows until the full one is there
    ratio: number                       // width over height, so the frame has its size before anything loads
    origin?: HTMLElement                // the element showing it on the card
}

export const viewer = $state({
    open: false,
    images: [] as ViewerImage[],
    index: 0
})

export function showImages(images: ViewerImage[], index = 0){
    if(!images.length) return
    viewer.images = images
    viewer.index = index
    viewer.open = true
}
