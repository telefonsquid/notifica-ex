import { MB } from '#lib/limits.ts';
import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema, limitedText, type RecordModel } from '#lib/schemas/base.ts';
import z from 'zod';

// FILE LIMITS =============================================
const uploadBytesSchema = z.number().int().min(MB, 'A size limit must be at least 1 MB.').max(LIMITS.UPLOAD_BYTES, `A file must not be larger than ${LIMITS.UPLOAD_BYTES / MB} MB.`);
const storageBytesSchema = z.number().int().min(0).max(LIMITS.STORAGE_BYTES);

// What one account may do with files
export type FileLimits = z.infer<typeof fileLimitsSchema>;
export type LimitOverrides = Partial<FileLimits>;
const fileLimitsSchema = z.object({
    attachments: z.boolean(),           // May attach files besides images
    attachmentBytes: uploadBytesSchema, // One attachment
    imageBytes: uploadBytesSchema,      // One image
    storageBytes: storageBytesSchema    // Everything on the notes they own
});

export const defaultLimitChangesSchema = fileLimitsSchema.partial();

// Null hands that limit back to the default
export const userLimitChangesSchema = z.object({
    attachments: fileLimitsSchema.shape.attachments.nullable(),
    attachmentBytes: uploadBytesSchema.nullable(),
    imageBytes: uploadBytesSchema.nullable(),
    storageBytes: storageBytesSchema.nullable()
}).partial();



// USER ===================================================================
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
    appPaused?: boolean;
    appResumed?: string;        // What the phones missed before this stays missed
    limits?: LimitOverrides | null;
    streamEpoch?: number;
}

// What the user admin gets to see of every account
export type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'authorizationLevel' | 'state'>;



// PUSH ===================================================================

// One browser that wants reminders | https only, the server posts to this address
export const pushSubscriptionSchema = z.object({
    endpoint: z.url({ protocol: /^https$/ }).max(LIMITS.PUSH_ENDPOINT),
    p256dh: limitedText('Key', LIMITS.PUSH_P256DH),
    auth: limitedText('Key', LIMITS.PUSH_AUTH),
});

export type PushSubscriptionRecord = RecordModel & z.infer<typeof pushSubscriptionSchema> & { owner: string }



// LOGIN ===================================================================
export const loginInputSchema = z.object({
    email: userInputSchema.shape.email,
    password: limitedText('Password', LIMITS.PASSWORD).min(1, 'Password is required')
});

export const setPasswordSchema = z.object({
    token: limitedText('Link', LIMITS.RESET_TOKEN).min(1, 'This link is incomplete.'),
    password: z.string()
        .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
        .max(LIMITS.PASSWORD, `Password must be less than ${LIMITS.PASSWORD} characters`),
    passwordConfirm: limitedText('Password', LIMITS.PASSWORD)
}).refine((data) => data.password === data.passwordConfirm, { message: 'Passwords do not match', path: ['passwordConfirm'] });
