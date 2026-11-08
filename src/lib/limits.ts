import { LIMITS } from '#lib/schema_limits.ts';
import type { FileLimits, LimitOverrides } from '#lib/schemas/users.ts';

export const MB = 1024 * 1024
export const GB = 1024 * MB

// Per stored file name | attachments keep the name they came with, the stored one carries a random suffix
export type FileInfo = Record<string, { bytes: number, name?: string }>

export const DEFAULT_LIMITS: FileLimits = {
    attachments: true,
    attachmentBytes: LIMITS.UPLOAD_BYTES,
    imageBytes: 15 * MB,
    storageBytes: GB,
    aiAccess: true
}

export function effectiveLimits(defaults: FileLimits, overrides?: LimitOverrides | null): FileLimits {
    return { ...defaults, ...overrides }
}

export function usedBytes(notes: { fileInfo?: FileInfo | null }[]) {
    let total = 0
    for(const note of notes){
        for(const file of Object.values(note.fileInfo ?? {})) total += file.bytes
    }
    return total
}

export function formatBytes(bytes: number) {
    if(bytes < 1024) return `${bytes} B`
    if(bytes < MB) return `${Math.round(bytes / 1024)} KB`
    if(bytes < GB) return `${round(bytes / MB)} MB`
    return `${round(bytes / GB)} GB`
}

// One decimal while the number is small, whole above that
function round(value: number) {
    return value < 100 ? Math.round(value * 10) / 10 : Math.round(value)
}
