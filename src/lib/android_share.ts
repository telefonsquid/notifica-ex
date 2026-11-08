import { imagesIn } from '#lib/images.ts';
import { sharedContent } from '#lib/notes.ts';
import type { NoteContent } from '#lib/schemas/notes.ts';

// What other apps shared into the Android app
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
