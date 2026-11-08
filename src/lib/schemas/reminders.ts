import { REPEATS, WEEKDAY_CODES } from '#lib/reminders.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { limitedCount, limitedText, type RecordModel } from '#lib/schemas/base.ts';
import z from 'zod';

// RULES ===================================================================
export type ReminderRepeat = z.infer<typeof reminderRepeatSchema>;
const reminderRepeatSchema = z.enum(REPEATS);

export type Weekday = z.infer<typeof weekdaySchema>;
const weekdaySchema = z.enum(WEEKDAY_CODES);

const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must look like 14:00.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-12-31.');

const timezoneSchema = limitedText('Timezone', LIMITS.TIMEZONE).refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true }
    catch { return false }
}, 'Unknown timezone.');

// Narrows when a repeating reminder may go off | only rules of one kind add up, any except rule blocks
export type ReminderLimit = z.infer<typeof reminderLimitSchema>;
const reminderLimitSchema = z.discriminatedUnion('kind', [
    z.object({ mode: z.enum(['only', 'except']), kind: z.literal('times'), from: clockSchema, to: clockSchema }),    // A stretch of the day, may run past midnight
    z.object({ mode: z.enum(['only', 'except']), kind: z.literal('days'), days: z.array(weekdaySchema).min(1, 'Pick at least one day.').max(7) }),
    z.object({ mode: z.enum(['only', 'except']), kind: z.literal('dates'), from: dateSchema, to: dateSchema })       // Both days count whole
]);

// What the user picks | everything else on a reminder follows from it
export type ReminderRule = z.infer<typeof reminderRuleSchema>;
export const reminderRuleSchema = z.object({
    at: z.iso.datetime({ offset: true, message: 'Reminder needs a valid date.' }), // First time it goes off
    repeat: reminderRepeatSchema,
    every: limitedCount('Interval', LIMITS.REMINDER_EVERY).min(1, 'Interval must be at least 1.'),
    weekdays: z.array(weekdaySchema).max(7).default([]), // Days a weekdays reminder goes off on
    until: z.union([z.iso.datetime({ offset: true, message: 'End needs a valid date.' }), z.literal('')]).default(''), // Last moment a repeating reminder may go off
    timezone: timezoneSchema, // Keeps daily reminders on the same clock time across daylight saving
    rules: z.array(reminderLimitSchema).max(LIMITS.REMINDER_RULES).default([]), // The advanced only and except limits
    task: z.boolean() // Adds a done button to the notification
});



// RECORDS ===================================================================
export type Reminder = RecordModel & ReminderRule & {
    note: string;
    owner: string;
    next: string; // Empty once a one off reminder went out
    open: number; // Logged task occurrences not checked off yet
}

// One time a reminder went off | keeps what the reminder looked like then, so later edits leave the history alone
export type Occurrence = RecordModel & {
    owner: string;
    note: string;
    reminder: string; // Empty once the reminder was removed
    at: string;
    rule: string;
    timezone: string;
    task: boolean;
    done: string; // When it was checked off
    comment: string;
}
