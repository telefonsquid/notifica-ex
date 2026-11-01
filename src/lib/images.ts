import { resolve } from '$app/paths';
import { notify } from '#lib/notifications.svelte.ts';
import { IMAGE_TYPES } from '#lib/schemas.ts';

// IMAGES OF A NOTE | served by /api/notes/[id]/images, which checks access on every request

// Width the card shows them at, pocketbase prepares both
export type ImageSize = 'card' | 'open'
const SIZES: Record<ImageSize, string> = { card: '640x0', open: '1280x0' }

export function imageUrl(note: string, file: string, size: ImageSize): string {
    return `${resolve('/api/notes/[id]/images/[file]', { id: note, file })}?size=${SIZES[size]}`
}

// The image files among whatever got pasted or dropped
export function imagesIn(files: FileList | null | undefined): File[] {
    return [...(files ?? [])].filter((file) => (IMAGE_TYPES as readonly string[]).includes(file.type))
}

// UPLOAD | one request per image keeps each below the body size limit, a failed one doesn't stop the rest
export async function uploadImages(note: string, files: File[]): Promise<number> {
    let stored = 0
    for(const file of files){
        const body = new FormData()
        body.append('images', file)
        try {
            const response = await fetch(resolve('/api/notes/[id]/images', { id: note }), { method: 'POST', body })
            if(response.ok) stored++
            else notify((await response.json().catch(() => null))?.message ?? `${file.name} could not be stored.`, { type: 'error' })
        } catch {
            notify(`${file.name} could not be stored, the connection failed.`, { type: 'error' })
        }
    }
    return stored
}
