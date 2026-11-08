import { parseTimestamp } from '#lib/reminders.ts';
import type { Note } from '#lib/schemas/notes.ts';
import type { ViewSort } from '#lib/schemas/views.ts';

// Creation time stands in until a drag gives the note a place of its own
export function positionOf(note: Note): number {
    return note.position || parseTimestamp(note.created)?.getTime() || 0
}

// A dropped note lands halfway between its new neighbours | either side may be missing at the ends
export function positionBetween(before: Note | undefined, after: Note | undefined, direction: ViewSort['direction']): number {
    const [higher, lower] = direction === 'desc' ? [before, after] : [after, before]
    if(higher && lower) return (positionOf(higher) + positionOf(lower)) / 2
    if(higher) return positionOf(higher) / 2
    if(lower) return positionOf(lower) + 60_000
    return Date.now()
}
