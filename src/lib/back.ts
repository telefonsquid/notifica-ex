// Asked by MainActivity in the Android app before it steps back a page
declare global {
    interface Window { closeOverlay?: () => boolean }
}

// BACK | closes what Escape would close and says if anything did, overlays go before pages
// Whoever handles Escape prevents its default
export function closeOverlay(){
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    return !(document.activeElement ?? document.body).dispatchEvent(escape)
}
