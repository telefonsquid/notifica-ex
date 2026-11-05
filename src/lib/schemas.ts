import { NOTE_COLORS } from '#lib/note_colors.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import type { RecordAuthResponse } from 'pocketbase';
import z from 'zod';

// PRIMITIVES ==============================================
function limitedText(label: string, max: number) {
    return z.string().max(max, `${label} must not be longer than ${max} characters.`)
}

function limitedCount(label: string, max: number) {
    return z.number()
        .int(`${label} must be a whole number.`)
        .min(0, `${label} must not be negative.`)
        .max(max, `${label} must not be larger than ${max}.`)
}

export const idSchema = limitedText('Id', LIMITS.ID)
    .regex(/^[A-Za-z0-9_-]*$/, 'Id may only contain letters, numbers, underscores and dashes.');

export function isId(value: unknown): value is string { return idSchema.safeParse(value).success }



// TYPES => POCKETBASE =================================================
export type CollectionMap = {
    'users': User;
    'migrations': Migration;
    'labels': Label;
    'notes': Note;
    'reminders': Reminder;
    'occurrences': Occurrence;
    'views': View;
    'push_subscriptions': PushSubscriptionRecord;
    '_superusers': RecordAuthResponse<RecordModel>;
}

export type Collection = keyof CollectionMap;

// What pocketbase adds to every record
export type RecordModel = {
    collectionId: string;
    collectionName: string;
    id: string;
    created: string;
    updated: string;
    expand?: Record<string, unknown>;
}

export type FetchOptions = {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: string;
    expand?: string;
    fields?: string;
}



// TYPES => MIGRATIONS =============================================
export type Migration = RecordModel & {
    version: string; // app release this migration belongs to
    completed: boolean;
}



// TYPES => USER ===================================================================
export const userStateSchema = z.enum(['active', 'inactive']);

export type AuthorizationLevel = z.infer<typeof authorizationLevelSchema>;
const authorizationLevelSchema = z.enum(['user', 'admin']);

// Where this user's reminders get published
export const ntfyTopicSchema = limitedText('Topic', LIMITS.NTFY_TOPIC)
    .regex(/^[-_A-Za-z0-9]*$/, 'Topic may only contain letters, numbers, underscores and dashes.');

export const userInputSchema = z.object({
    name: z.string()
        .min(1, 'Name is required')
        .max(LIMITS.USER_NAME, `Name must be less than ${LIMITS.USER_NAME} characters`)
        .trim(),
    email: z.email('Invalid email address')
        .min(1, 'Email is required')
        .max(LIMITS.USER_EMAIL, `Email must be less than ${LIMITS.USER_EMAIL} characters`)
        .trim()
        .toLowerCase(),
    authorizationLevel: authorizationLevelSchema
});

export const userEditSchema = userInputSchema.extend({ id: idSchema });

export type User = RecordModel & z.infer<typeof userInputSchema> & {
    state: z.infer<typeof userStateSchema>;
    emailVisibility: boolean;
    verified: boolean;
    password?: string;
    passwordConfirm?: string;
    'tokenKey:autogenerate'?: string;
    ntfyTopic?: string;
    ntfyPaused?: boolean;
}

// What the user admin gets to see of every account
export type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'authorizationLevel' | 'state'>;

// One browser that wants reminders | https only, the server posts to this address
export const pushSubscriptionSchema = z.object({
    endpoint: z.url({ protocol: /^https$/ }).max(LIMITS.PUSH_ENDPOINT),
    p256dh: limitedText('Key', LIMITS.PUSH_KEY),
    auth: limitedText('Key', LIMITS.PUSH_KEY),
});

type PushSubscriptionRecord = RecordModel & z.infer<typeof pushSubscriptionSchema> & { owner: string }

export const loginInputSchema = z.object({
    email: userInputSchema.shape.email,
    password: limitedText('Password', LIMITS.PASSWORD).min(1, 'Password is required')
});

export const setPasswordSchema = z.object({
    token: limitedText('Link', LIMITS.RESET_TOKEN).min(1, 'This link is incomplete.'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(LIMITS.PASSWORD, `Password must be less than ${LIMITS.PASSWORD} characters`),
    passwordConfirm: limitedText('Password', LIMITS.PASSWORD)
}).refine((data) => data.password === data.passwordConfirm, { message: 'Passwords do not match', path: ['passwordConfirm'] });



// TYPES => COLORS ===================================================================

// Empty means the plain card
export type NoteColor = z.infer<typeof noteColorSchema>;
export const noteColorSchema = z.enum(NOTE_COLORS).or(z.literal(''));



// TYPES => LABELS ===================================================================
export const labelNameSchema = limitedText('Label', LIMITS.LABEL_NAME).trim().min(1, 'Label needs a name.');

export type Label = RecordModel & {
    owner: string;
    name: string;
    color: NoteColor;
}



// TYPES => NOTES ===================================================================
export type NoteContent = z.infer<typeof noteContentSchema>;
export const noteContentSchema = z.object({
    title: limitedText('Title', LIMITS.NOTE_TITLE).trim(),
    body: limitedText('Text', LIMITS.NOTE_BODY), // markdown, checklists included
    color: noteColorSchema,
    labels: z.array(idSchema).max(LIMITS.NOTE_LABELS, `A note carries at most ${LIMITS.NOTE_LABELS} labels.`),
    pinned: z.boolean(),
    archived: z.boolean()
});

// Name pocketbase gave an uploaded file
export const fileNameSchema = limitedText('File name', LIMITS.FILE_NAME).regex(/^[\w.-]+$/, 'File name may only contain letters, numbers, dots, underscores and dashes.');

// Zero until the note gets dragged, it sorts by its creation time until then
export const notePositionSchema = z.number().min(0).max(LIMITS.NOTE_POSITION);

export type Note = RecordModel & NoteContent & {
    owner: string;
    position: number; // order in a manual sort
    images: string[]; // uploaded through /api/notes/[id]/images, never part of a draft
    shared: string[]; // people who may see and edit it besides the owner
}

// What the others on a shared note get to know about someone
export type Person = { id: string, name: string }



// TYPES => REMINDERS ===================================================================
export type ReminderRepeat = z.infer<typeof reminderRepeatSchema>;
const reminderRepeatSchema = z.enum(['never', 'minutes', 'hours', 'days', 'weeks', 'weekdays', 'months', 'years']);

export type Weekday = z.infer<typeof weekdaySchema>;
const weekdaySchema = z.enum(['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']);

const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must look like 14:00.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-12-31.');

const timezoneSchema = limitedText('Timezone', LIMITS.TIMEZONE).refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true }
    catch { return false }
}, 'Unknown timezone.');

// Narrows when a repeating reminder may go off | only rules of one kind add up, any except rule blocks
export type ReminderLimit = z.infer<typeof reminderLimitSchema>;
const reminderLimitSchema = z.discriminatedUnion('kind', [
    z.object({ mode: z.enum(['only', 'except']), kind: z.literal('times'), from: clockSchema, to: clockSchema }),    // a stretch of the day, may run past midnight
    z.object({ mode: z.enum(['only', 'except']), kind: z.literal('days'), days: z.array(weekdaySchema).min(1, 'Pick at least one day.').max(7) }),
    z.object({ mode: z.enum(['only', 'except']), kind: z.literal('dates'), from: dateSchema, to: dateSchema })       // both days count whole
]);

// What the user picks | everything else on a reminder follows from it
export type ReminderRule = z.infer<typeof reminderRuleSchema>;
export const reminderRuleSchema = z.object({
    at: z.iso.datetime({ offset: true, message: 'Reminder needs a valid date.' }), // first time it goes off
    repeat: reminderRepeatSchema,
    every: limitedCount('Interval', LIMITS.REMINDER_EVERY).min(1, 'Interval must be at least 1.'),
    weekdays: z.array(weekdaySchema).max(7).default([]), // days a weekdays reminder goes off on
    until: z.union([z.iso.datetime({ offset: true, message: 'End needs a valid date.' }), z.literal('')]).default(''), // last moment a repeating reminder may go off
    timezone: timezoneSchema, // keeps daily reminders on the same clock time across daylight saving
    rules: z.array(reminderLimitSchema).max(LIMITS.REMINDER_RULES).default([]), // the advanced only and except limits
    task: z.boolean() // adds a done button to the notification
});

export type Reminder = RecordModel & ReminderRule & {
    note: string;
    owner: string;
    next: string; // empty once a one off reminder went out
    open: number; // logged task occurrences not checked off yet
}

// One time a reminder went off | keeps what the reminder looked like then, so later edits leave the history alone
export type Occurrence = RecordModel & {
    owner: string;
    note: string;
    reminder: string; // empty once the reminder was removed
    at: string;
    rule: string;
    timezone: string;
    task: boolean;
    done: string; // when it was checked off
    comment: string;
}



// TYPES => VIEWS ===================================================================
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
    from: daySchema.default(''), // days in the browser's timezone, empty leaves that side open
    to: daySchema.default('')
});

const reminderStateSchema = z.enum(['any', 'with', 'without', 'upcoming', 'repeating', 'tasks', 'waiting', 'finished']);

// Every field has a default, so filters saved before a field existed still parse
export type ViewFilter = z.infer<typeof viewFilterSchema>;
export const viewFilterSchema = z.object({
    words: limitedText('Words', LIMITS.VIEW_WORDS).default(''), // all of them have to appear
    without: limitedText('Words', LIMITS.VIEW_WORDS).default(''), // none of them may appear
    titleOnly: z.boolean().default(false),
    include: z.array(idSchema).max(LIMITS.VIEW_LABELS).default([]),
    exclude: z.array(idSchema).max(LIMITS.VIEW_LABELS).default([]),
    labelMatch: z.enum(['any', 'all']).default('any'), // how included labels combine
    labelled: z.enum(['any', 'with', 'without']).default('any'),
    colors: z.array(noteColorSchema).max(NOTE_COLORS.length + 1).default([]), // empty means every color
    pinned: z.enum(['any', 'only', 'hide']).default('any'),
    archived: z.enum(['hide', 'only', 'any']).default('hide'),
    reminder: reminderStateSchema.default('any'),
    list: z.enum(['any', 'open', 'complete']).default('any'), // checklist progress
    created: dateRangeSchema.prefault({}),
    updated: dateRangeSchema.prefault({}),
    due: dateRangeSchema.prefault({}) // next time the reminder goes off
});

export type ViewSort = z.infer<typeof viewSortSchema>;
export const viewSortSchema = z.object({
    by: z.enum(['manual', 'updated', 'created', 'title', 'reminder']).default('manual'), // manual starts out newest first
    direction: z.enum(['asc', 'desc']).default('desc'),
    pinnedFirst: z.boolean().default(true)
});

export type ViewContent = z.infer<typeof viewContentSchema>;
export const viewContentSchema = z.object({
    name: viewNameSchema,
    icon: viewIconSchema,
    filter: viewFilterSchema.prefault({}),
    sort: viewSortSchema.prefault({})
});

// Only what was sent changes | partial() alone would fill a missing filter or sort with the defaults
export const viewChangesSchema = z.object({
    name: viewNameSchema,
    icon: viewIconSchema,
    filter: viewFilterSchema,
    sort: viewSortSchema
}).partial();

export type View = RecordModel & ViewContent & {
    owner: string;
    position: number; // order in the rail
}
