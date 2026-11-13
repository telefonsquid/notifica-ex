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

// What a note wears | a color picked by hand wins, else the highest auto color label on it, else the account's default
export function shownColor(note: Pick<NoteContent, 'color' | 'colorDefault' | 'labels'>, order: Label[]): NoteColor {
    if(note.color && !note.colorDefault) return note.color
    return order.find((label) => note.labels.includes(label.id))?.color ?? note.color
}
