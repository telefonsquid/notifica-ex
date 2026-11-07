import { resolve } from '$app/paths';
import { formatBytes } from '#lib/limits.ts';
import type { Note } from '#lib/schemas.ts';

// URLS ====================================================================================================
type ImageSize = 'thumb' | 'full'

// Served through our own route, the files are protected in pocketbase
export function imageUrl(note: string, name: string, size: ImageSize = 'thumb'): string {
    const path = resolve('/api/notes/[id]/images/[name]', { id: note, name })
    return size === 'thumb' ? `${path}?thumb=640x0` : path
}



// UPLOAD ====================================================================================================
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const MAX_EDGE = 2560                       // px, plenty for a note and keeps phone photos small
const KEEP_BELOW = 1024 * 1024              // bytes, smaller files go up as they are

export function imagesIn(files: Iterable<File> | null | undefined): File[] {
    return [...files ?? []].filter((file) => IMAGE_TYPES.includes(file.type))
}

// Scales big photos down and turns them into WebP | GIFs keep their animation, anything that fails goes up untouched
export async function shrink(file: File): Promise<File> {
    if(file.type === 'image/gif') return file

    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
        if(scale === 1 && file.size < KEEP_BELOW){
            bitmap.close()
            return file
        }

        const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        bitmap.close()

        // Browsers without a WebP encoder hand back a PNG, often bigger than what came in
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })
        if(blob.type !== 'image/webp' || blob.size >= file.size) return file
        return new File([blob], `${file.name.replace(/\.\w+$/, '') || 'image'}.webp`, { type: 'image/webp' })
    } catch {
        return file
    }
}

// One file per request keeps each one well below the server's body limit
export async function uploadImage(note: string, file: File, maxBytes: number): Promise<Note> {
    if(file.size > maxBytes) throw new Error(`${file.name} is larger than ${formatBytes(maxBytes)}.`)

    const form = new FormData()
    form.append('images', file)
    const response = await fetch(resolve('/api/notes/[id]/images', { id: note }), { method: 'POST', body: form })
    if(!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Could not upload the image.')
    return await response.json()
}
