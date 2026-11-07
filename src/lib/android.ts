import { imagesIn } from '#lib/images.ts';
import { sharedContent } from '#lib/notes.ts';
import type { NoteContent } from '#lib/schemas.ts';
import { THEMES } from '#lib/themes/index.ts';

// Set by MainActivity in the Android app, missing in any browser | an older app lacks the optional ones
declare global {
    interface Window {
        NotificaAndroid?: {
            statusBar(light: boolean): void
            listen?(url: string): void
            stopListening?(): void
            notificationsOn?(): boolean
            notificationsAllowed?(): boolean
            setNotifications?(on: boolean): void
            openNotificationSettings?(): void
            pendingLink?(): string | null
            changeServer?(): void
            hasShare?(): boolean
            takeShare?(): string | null
            sharedImage?(index: number): string | null
        }
    }
}

// STATUS BAR | dark icons on light themes, the phone's own dark mode would otherwise pick them
// Overlays with their own backdrop pass their scheme instead
export function syncStatusBar(scheme?: 'light' | 'dark'){
    if(!window.NotificaAndroid) return
    scheme ??= THEMES.find((theme) => theme.name === document.documentElement.dataset.theme)?.scheme
    window.NotificaAndroid.statusBar(scheme !== 'dark')
}

// A notification tapped while the app was closed opens its note once the server's page is up
export function followPendingLink(){
    const link = window.NotificaAndroid?.pendingLink?.()
    if(link) location.replace(link)
}

// SHARED FROM OTHER APPS ====================================================================================================
export type SharedNote = { content: Partial<NoteContent>, files: File[], unread: number }

export function hasShare(){
    return window.NotificaAndroid?.hasShare?.() ?? false
}

function fileFrom(address: string, index: number){
    const [head, data] = address.split(',')
    const type = head.slice('data:'.length).split(';')[0]
    return new File([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], `shared-${index}`, { type })
}

// Null without anything waiting | unread counts the images that got lost on the way
export function takeShare(): SharedNote | null {
    const app = window.NotificaAndroid
    const raw = app?.takeShare?.()
    if(!raw) return null

    const { title, text, images } = JSON.parse(raw) as { title: string, text: string, images: number }
    const addresses = Array.from({ length: images }, (_, index) => app?.sharedImage?.(index) ?? null)
    const files = imagesIn(addresses.flatMap((address, index) => address ? [fileFrom(address, index)] : []))

    return { content: sharedContent(title, text), files, unread: images - files.length }
}
