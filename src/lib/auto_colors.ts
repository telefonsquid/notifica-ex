import type { Label, NoteColor, NoteContent } from '#lib/schemas/notes.ts';

// The priority chart, highest first | ties fall back to the name so every browser agrees
export function autoColorOrder(labels: Label[]): Label[] {
    return labels
        .filter((label) => label.autoColor)
        .toSorted((a, b) => a.colorPriority - b.colorPriority || a.name.localeCompare(b.name))
}

export function lastPriority(labels: Label[]): number {
    return Math.max(-1, ...autoColorOrder(labels).map((label) => label.colorPriority))
}

// What a note wears | its own color wins, without one the highest auto color label on it decides
export function shownColor(note: Pick<NoteContent, 'color' | 'labels'>, order: Label[]): NoteColor {
    if(note.color) return note.color
    return order.find((label) => note.labels.includes(label.id))?.color ?? ''
}
