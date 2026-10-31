import { LIMITS, idSchema, limitedCount, limitedText, timestampSchema } from '#lib/schema_limits.ts';
import type { RecordAuthResponse } from 'pocketbase';
import z from 'zod';


// TYPES => POCKETBASE =================================================
export type CollectionMap = {
    'users': User;
    'migrations': Migration;
    'labels': Label;
    'notes': Note;
    'reminders': Reminder;
    '_superusers': RecordAuthResponse<RecordModel>;
}

const _collectionKeys: Record<keyof CollectionMap, true> = { // the collection type doesn't exist at runtime
    'users': true,
    'migrations': true,
    'labels': true,
    'notes': true,
    'reminders': true,
    '_superusers': true,
};

export type Collection = z.infer<typeof collectionSchema>;
export const collectionSchema = z.enum(
    Object.keys(_collectionKeys) as [keyof CollectionMap, ...(keyof CollectionMap)[]]
);

export type RecordModel = z.infer<typeof recordModelSchema>;
export const recordModelSchema = z.object({
    collectionId: idSchema,
    collectionName: collectionSchema,
    id: idSchema,
    created: timestampSchema,
    updated: timestampSchema,
    expand: z.record(limitedText('Expand key', LIMITS.EXPAND_KEY), z.unknown())
        .refine(value => Object.keys(value).length <= LIMITS.EXPAND_KEYS, `A maximum of ${LIMITS.EXPAND_KEYS} expanded relations is allowed.`)
        .optional()
});

export const createListModelSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
    page: limitedCount('Page', LIMITS.PAGE_NUMBER),
    perPage: limitedCount('Page size', LIMITS.PAGE_SIZE),
    totalItems: limitedCount('Total items', LIMITS.TOTAL_ITEMS),
    totalPages: limitedCount('Total pages', LIMITS.TOTAL_PAGES),
    items: z.array(itemSchema)
});

export type FetchOptions = z.infer<typeof fetchOptionsSchema>;
export const fetchOptionsSchema = z.object({
    page: z.number().int('Page must be a whole number.').min(1, 'Page must be at least 1.').max(LIMITS.PAGE_NUMBER, `Page must not be larger than ${LIMITS.PAGE_NUMBER}.`).optional(),
    perPage: z.number().int('Page size must be a whole number.').min(1, 'Page size must be at least 1.').max(LIMITS.PAGE_SIZE, `Page size must not be larger than ${LIMITS.PAGE_SIZE}.`).optional(),
    sort: limitedText('Sort', LIMITS.FETCH_SORT).regex(/^[A-Za-z0-9_,.@+-]*$/, 'Sort may only name fields.').optional(),
    filter: limitedText('Filter', LIMITS.FETCH_FILTER).optional(), // stays a raw pocketbase expression, only its size is bounded here
    expand: limitedText('Expand', LIMITS.FETCH_EXPAND).regex(/^[A-Za-z0-9_,.]*$/, 'Expand may only name relations.').optional()
});

export const pbOmitMap = {
    id: true,
    created: true,
    updated: true,
    collectionId: true,
    collectionName: true,
    expand: true
};







// TYPES => MIGRATIONS =============================================
export type Migration = z.infer<typeof migrationSchema>;
export const migrationSchema = recordModelSchema.extend({
    version: limitedText('Migration version', LIMITS.MIGRATION_VERSION), // app release this migration belongs to
    completed: z.boolean()
});







// TYPES => USER ===================================================================
export type UserState = z.infer<typeof userStateSchema>;
export const userStateSchema = z.enum(['active', 'inactive']);

export type AuthorizationLevel = z.infer<typeof authorizationLevelSchema>;
export const authorizationLevelSchema = z.enum(['user', 'admin']);

// Where this user's reminders get published
export const ntfyTopicSchema = limitedText('Topic', LIMITS.NTFY_TOPIC)
    .regex(/^[-_A-Za-z0-9]*$/, 'Topic may only contain letters, numbers, underscores and dashes.');

export type UserBase = z.infer<typeof userBaseSchema>;
export const userBaseSchema = z.object({
    email: z.email('Invalid email address')
        .min(1, 'Email is required')
        .max(LIMITS.USER_EMAIL, `Email must be less than ${LIMITS.USER_EMAIL} characters`)
        .trim()
        .toLowerCase(),
    emailVisibility: z.boolean().default(false),
    name: z.string()
        .min(1, 'Name is required')
        .max(LIMITS.USER_NAME, `Name must be less than ${LIMITS.USER_NAME} characters`)
        .trim(),
    authorizationLevel: authorizationLevelSchema,
    state: userStateSchema,
    verified: z.boolean().default(true),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(LIMITS.PASSWORD, `Password must be less than ${LIMITS.PASSWORD} characters`)
        .optional(),
    passwordConfirm: z.string()
        .max(LIMITS.PASSWORD, `Password must be less than ${LIMITS.PASSWORD} characters`)
        .optional(),
    'tokenKey:autogenerate': limitedText('Token key', LIMITS.TOKEN_KEY).optional(),
    ntfyTopic: ntfyTopicSchema.optional(),
});

export type User = z.infer<typeof userSchema>;
export const userSchema = recordModelSchema
    .and(userBaseSchema)
    .superRefine((data, ctx) => {
        if(data.password || data.passwordConfirm){
            if(data.password !== data.passwordConfirm){
                ctx.addIssue({
                    code: 'custom',
                    message: 'Passwords do not match',
                    path: ['passwordConfirm']
                });
            }
        }
    });

export type LoginInput = z.infer<typeof loginInputSchema>;
export const loginInputSchema = z.object({
    email: userBaseSchema.shape.email,
    password: limitedText('Password', LIMITS.PASSWORD).min(1, 'Password is required')
});

// What the user admin gets to see of every account
export type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'authorizationLevel' | 'state'>;

export type UserInput = z.infer<typeof userInputSchema>;
export const userInputSchema = userBaseSchema.pick({ name: true, email: true, authorizationLevel: true });

export const userEditSchema = userInputSchema.extend({ id: idSchema });

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export const setPasswordSchema = z.object({
    token: limitedText('Link', LIMITS.RESET_TOKEN).min(1, 'This link is incomplete.'),
    password: userBaseSchema.shape.password.unwrap(),
    passwordConfirm: limitedText('Password', LIMITS.PASSWORD)
}).refine((data) => data.password === data.passwordConfirm, { message: 'Passwords do not match', path: ['passwordConfirm'] });







// TYPES => COLORS ===================================================================
// Notes and labels share them, each name has a [data-note] rule in #lib/note_colors.css
export const NOTE_TINTS = ['lemon', 'ochre', 'tangerine', 'coral', 'rose', 'magenta', 'violet', 'cobalt', 'sky', 'powder', 'teal', 'mint', 'moss', 'slate', 'platinum'] as const;
export const NOTE_SOLIDS = ['ochre-solid', 'tangerine-solid', 'coral-solid', 'cherry-solid', 'rose-solid', 'magenta-solid', 'plum-solid', 'violet-solid', 'midnight-solid', 'cobalt-solid', 'sky-solid', 'powder-solid', 'teal-solid', 'mint-solid', 'moss-solid', 'forest-solid', 'slate-solid', 'platinum-solid'] as const;
export const NOTE_STICKIES = ['canary', 'apricot', 'bubblegum', 'lilac', 'aqua', 'lime'] as const;
export const NOTE_TEXTURES = ['ruled', 'legal', 'graph', 'dots', 'linen', 'gingham', 'zigzag', 'terrazzo', 'topo', 'stripes', 'kraft', 'chalkboard', 'blueprint', 'starry', 'aurora', 'sunset', 'holo'] as const;
export const NOTE_COLORS = [...NOTE_TINTS, ...NOTE_SOLIDS, ...NOTE_STICKIES, ...NOTE_TEXTURES] as const;

// Empty means the plain card
export type NoteColor = z.infer<typeof noteColorSchema>;
export const noteColorSchema = z.enum(NOTE_COLORS).or(z.literal(''));







// TYPES => LABELS ===================================================================
export const labelNameSchema = limitedText('Label', LIMITS.LABEL_NAME).trim().min(1, 'Label needs a name.');

export type Label = z.infer<typeof labelSchema>;
export const labelSchema = recordModelSchema.extend({
    owner: idSchema,
    name: labelNameSchema,
    color: noteColorSchema
});







// TYPES => NOTES ===================================================================
export type NoteKind = z.infer<typeof noteKindSchema>;
export const noteKindSchema = z.enum(['text', 'list', 'markdown']);

export type NoteItem = z.infer<typeof noteItemSchema>;
export const noteItemSchema = z.object({
    id: idSchema, // generated in the browser, keeps rows stable while editing
    text: limitedText('Item', LIMITS.NOTE_ITEM),
    done: z.boolean()
});

export type NoteContent = z.infer<typeof noteContentSchema>;
export const noteContentSchema = z.object({
    title: limitedText('Title', LIMITS.NOTE_TITLE).trim(),
    kind: noteKindSchema,
    body: limitedText('Text', LIMITS.NOTE_BODY),
    items: z.array(noteItemSchema).max(LIMITS.NOTE_ITEMS, `A note holds at most ${LIMITS.NOTE_ITEMS} items.`),
    color: noteColorSchema,
    labels: z.array(idSchema).max(LIMITS.NOTE_LABELS, `A note carries at most ${LIMITS.NOTE_LABELS} labels.`),
    pinned: z.boolean(),
    archived: z.boolean()
});

export type Note = z.infer<typeof noteSchema>;
export const noteSchema = recordModelSchema.extend({
    owner: idSchema,
    ...noteContentSchema.shape,
    items: noteContentSchema.shape.items.nullable() // pocketbase returns null for a json field never written
});







// TYPES => REMINDERS ===================================================================
export type ReminderRepeat = z.infer<typeof reminderRepeatSchema>;
export const reminderRepeatSchema = z.enum(['never', 'hours', 'days', 'weeks']);

export const timezoneSchema = limitedText('Timezone', LIMITS.TIMEZONE).refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true }
    catch { return false }
}, 'Unknown timezone.');

// What the user picks | everything else on a reminder follows from it
export type ReminderRule = z.infer<typeof reminderRuleSchema>;
export const reminderRuleSchema = z.object({
    at: z.iso.datetime({ offset: true, message: 'Reminder needs a valid date.' }), // first time it goes off
    repeat: reminderRepeatSchema,
    every: limitedCount('Interval', LIMITS.REMINDER_EVERY).min(1, 'Interval must be at least 1.'),
    timezone: timezoneSchema, // keeps daily reminders on the same clock time across daylight saving
    task: z.boolean() // adds a done button to the notification
});

export type Reminder = z.infer<typeof reminderSchema>;
export const reminderSchema = recordModelSchema.extend({
    note: idSchema,
    owner: idSchema,
    ...reminderRuleSchema.shape,
    at: timestampSchema,
    next: timestampSchema, // empty once a one off reminder went out
    sent: timestampSchema,
    done: timestampSchema // occurrence that was checked off
});
