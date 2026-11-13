import type { FileInfo } from '#lib/limits.ts';
import { NOTE_COLORS } from '#lib/note_colors.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema, limitedText, type RecordModel } from '#lib/schemas/base.ts';
import z from 'zod';

// COLORS ===================================================================

// Empty means the plain card
export type NoteColor = z.infer<typeof noteColorSchema>;
export const noteColorSchema = z.enum(NOTE_COLORS).or(z.literal(''));



// LABELS ===================================================================
export const labelNameSchema = limitedText('Label', LIMITS.LABEL_NAME).trim().min(1, 'Label needs a name.');

export type Label = RecordModel & {
    owner: string;
    name: string;
    color: NoteColor;
    autoColor: boolean;         // Colors the notes it sits on
    colorPriority: number;      // Lowest wins among auto colors
}



// NOTES ===================================================================
export type NoteContent = z.infer<typeof noteContentSchema>;
export const noteContentSchema = z.object({
    title: limitedText('Title', LIMITS.NOTE_TITLE).trim(),
    body: limitedText('Text', LIMITS.NOTE_BODY), // Markdown, checklists included
    color: noteColorSchema,
    colorDefault: z.boolean().optional(),      // The color came from the account's default, auto color labels still win over it
    labels: z.array(idSchema).max(LIMITS.NOTE_LABELS, `A note carries at most ${LIMITS.NOTE_LABELS} labels.`),
    pinned: z.boolean(),
    archived: z.boolean()
});

// A locked body as the browser encrypted it, see #lib/note_lock.svelte.ts
export const sealedSchema = limitedText('Locked text', LIMITS.NOTE_SEALED).regex(/^v1\.[\w-]{8,32}\.[\w-]{16}\.[\w-]+$/, 'Locked text is malformed.');

// Name pocketbase gave an uploaded file
export const fileNameSchema = limitedText('File name', LIMITS.FILE_NAME).regex(/^[\w.-]+$/, 'File name may only contain letters, numbers, dots, underscores and dashes.');

// Zero until the note gets dragged, it sorts by its creation time until then
export const notePositionSchema = z.number().min(0).max(LIMITS.NOTE_POSITION);

export type Note = RecordModel & NoteContent & {
    owner: string;
    position: number; // Order in a manual sort
    images: string[]; // Uploaded through /api/notes/[id]/images, never part of a draft
    attachments: string[]; // Uploaded through /api/notes/[id]/attachments, likewise
    fileInfo: FileInfo | null; // Sizes of both, what storage limits count
    shared: string[]; // People who may see and edit it besides the owner
    sealed: string; // The encrypted body of a locked note, its body stays empty meanwhile
    unreadable?: boolean; // Browser only, a locked note whose text isn't decrypted
}

// What the others on a shared note get to know about someone
export type Person = { id: string, name: string }
