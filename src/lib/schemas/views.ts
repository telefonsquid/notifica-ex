import { NOTE_COLORS } from '#lib/note_colors.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema, limitedCount, limitedText, type RecordModel } from '#lib/schemas/base.ts';
import { noteColorSchema } from '#lib/schemas/notes.ts';
import z from 'zod';

export type ViewIcon = z.infer<typeof viewIconSchema>;
const viewIconSchema = limitedText('Icon', LIMITS.VIEW_ICON).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Icon must be a lucide name.');

const viewNameSchema = limitedText('View', LIMITS.VIEW_NAME).trim().min(1, 'View needs a name.');

const daySchema = limitedText('Date', LIMITS.VIEW_DATE).regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Date must look like 2026-12-31.');

// Within: the last n units, or the next n for due dates | beyond: further away than that
export type DateRange = z.infer<typeof dateRangeSchema>;
const dateRangeSchema = z.object({
    mode: z.enum(['any', 'within', 'beyond', 'between']).default('any'),
    amount: limitedCount('Amount', LIMITS.VIEW_AMOUNT).min(1, 'Amount must be at least 1.').default(7),
    unit: z.enum(['days', 'weeks', 'months']).default('days'),
    from: daySchema.default(''), // Days in the browser's timezone, empty leaves that side open
    to: daySchema.default('')
});

const reminderStateSchema = z.enum(['any', 'with', 'without', 'upcoming', 'repeating', 'tasks', 'waiting', 'finished']);

// Every field has a default, so filters saved before a field existed still parse
export type ViewFilter = z.infer<typeof viewFilterSchema>;
export const viewFilterSchema = z.object({
    words: limitedText('Words', LIMITS.VIEW_WORDS).default(''), // All of them have to appear
    without: limitedText('Words', LIMITS.VIEW_WORDS).default(''), // None of them may appear
    titleOnly: z.boolean().default(false),
    include: z.array(idSchema).max(LIMITS.VIEW_LABELS).default([]),
    exclude: z.array(idSchema).max(LIMITS.VIEW_LABELS).default([]),
    labelMatch: z.enum(['any', 'all']).default('any'), // How included labels combine
    labelled: z.enum(['any', 'with', 'without']).default('any'),
    colors: z.array(noteColorSchema).max(NOTE_COLORS.length + 1).default([]), // Empty means every color
    pinned: z.enum(['any', 'only', 'hide']).default('any'),
    archived: z.enum(['hide', 'only', 'any']).default('hide'),
    reminder: reminderStateSchema.default('any'),
    list: z.enum(['any', 'open', 'complete']).default('any'), // Checklist progress
    created: dateRangeSchema.prefault({}),
    updated: dateRangeSchema.prefault({}),
    due: dateRangeSchema.prefault({}) // Next time the reminder goes off
});

export type ViewSort = z.infer<typeof viewSortSchema>;
export const viewSortSchema = z.object({
    by: z.enum(['manual', 'updated', 'created', 'title', 'reminder']).default('manual'), // Manual starts out newest first
    direction: z.enum(['asc', 'desc']).default('desc'),
    pinnedFirst: z.boolean().default(true)
});

// Only what was sent changes | partial() alone would fill a missing filter or sort with the defaults
export const viewChangesSchema = z.object({
    name: viewNameSchema,
    icon: viewIconSchema,
    filter: viewFilterSchema,
    sort: viewSortSchema
}).partial();

export type ViewContent = z.infer<typeof viewContentSchema>;
export const viewContentSchema = viewChangesSchema.required({ name: true, icon: true }).extend({
    filter: viewFilterSchema.prefault({}),
    sort: viewSortSchema.prefault({})
});

export type View = RecordModel & ViewContent & {
    owner: string;
    position: number; // Order in the rail
}
