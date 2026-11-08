import { LIMITS } from '#lib/schema_limits.ts';
import { limitedText } from '#lib/schemas/base.ts';
import { labelNameSchema, noteContentSchema, notePositionSchema } from '#lib/schemas/notes.ts';
import { reminderRuleSchema } from '#lib/schemas/reminders.ts';
import z from 'zod';

// IMPORTS ====================================================================

// Labels come by name, the server finds or makes them
export type ImportedNote = z.input<typeof importedNoteSchema>;
export const importedNoteSchema = noteContentSchema.omit({ labels: true }).extend({
    source: limitedText('Source', LIMITS.IMPORT_SOURCE).min(1),      // Same note in a later export, same source
    labels: z.array(labelNameSchema).max(LIMITS.NOTE_LABELS, `A note carries at most ${LIMITS.NOTE_LABELS} labels.`),
    position: notePositionSchema,
    reminders: z.array(reminderRuleSchema).max(LIMITS.IMPORT_REMINDERS).default([])     // Made only along with the note
});

export type CheckedImport = z.output<typeof importedNoteSchema>;
export const importBatchSchema = z.array(importedNoteSchema).min(1).max(LIMITS.IMPORT_BATCH);

// Files follow only for the created ones
export type ImportResult = { created: { source: string, id: string, reminders: number }[], existing: number }
