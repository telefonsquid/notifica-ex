import { LIMITS } from '#lib/schema_limits.ts';
import type { Note, NoteContent } from '#lib/schemas/notes.ts';

// LIST ======================================================================================================

export type NoteEvent = { action: string, record: Note }

// Patch single notes into the list | an answer older than what the list holds changes nothing
export function mergeNotes(list: Note[], events: NoteEvent[]): Note[] {
    const merged = new Map(list.map((note) => [note.id, note]))

    for(const { action, record } of events){
        const held = merged.get(record.id)
        if(action === 'delete') merged.delete(record.id)
        else if(!held || record.updated >= held.updated) merged.set(record.id, record)
    }

    return [...merged.values()]
}



// CONTENT ====================================================================================================
export function contentOf(note: Note): NoteContent {
    const { title, body, color, labels, pinned, archived } = note
    return { title, body, color, labels: [...labels], pinned, archived }
}

export function emptyNote(): NoteContent {
    return { title: '', body: '', color: '', labels: [], pinned: false, archived: false }
}

// Text from another app | other apps know nothing of the size caps
export function sharedContent(title: string, text: string): Partial<NoteContent> {
    return { title: title.trim().slice(0, LIMITS.NOTE_TITLE), body: text.trim().slice(0, LIMITS.NOTE_BODY) }
}

// Pinned only matters among active notes
export function archiveChange(note: Pick<NoteContent, 'pinned'>, archived: boolean): Pick<NoteContent, 'archived' | 'pinned'> {
    return { archived, pinned: !archived && note.pinned }
}

export function isEmpty(note: NoteContent): boolean {
    return !note.title.trim() && !note.body.trim()
}

// A closed card's height before it was ever on screen | a rough guess is enough, the real one replaces it long before it shows
export function estimatedHeight(note: Pick<Note, 'title' | 'body' | 'images' | 'attachments'>): number {
    const lines = note.body.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 40)), 0)
    return 48 + (note.title ? 28 : 0) + (note.body ? Math.min(lines, 12) * 22 : 0) + (note.images.length ? 180 : 0) + (note.attachments.length ? 28 : 0)
}
