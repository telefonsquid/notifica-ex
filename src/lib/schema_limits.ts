import z from 'zod';

// LIMITS ==============================================
export const LIMITS = {

    // TEXT => IDENTIFIERS
    ID: 64,                             // pocketbase ids are 15 chars, client generated ones are uuids at 36
    TIMESTAMP: 64,
    MIGRATION_VERSION: 32,              // semver of the app release a migration belongs to
    TOKEN_KEY: 128,                     // pocketbase auth token
    RESET_TOKEN: 2048,                  // jwt from the set password link
    EXPAND_KEY: 128,                    // relation name pocketbase expanded into a record

    // TEXT => NAMES
    USER_NAME: 128,
    USER_EMAIL: 256,
    PASSWORD: 72,                       // bcrypt ignores anything past this
    LABEL_NAME: 64,
    VIEW_NAME: 64,
    NTFY_TOPIC: 64,                     // ntfy rejects longer topics
    TIMEZONE: 64,                       // iana zone name like America/Argentina/Buenos_Aires

    // TEXT => NOTES
    NOTE_TITLE: 200,
    NOTE_BODY: 20000,

    // TEXT => VIEWS
    VIEW_WORDS: 200,                    // words a view looks for or leaves out
    VIEW_DATE: 10,                      // YYYY-MM-DD

    // TEXT => FETCH OPTIONS
    FETCH_FILTER: 2048,
    FETCH_SORT: 256,
    FETCH_EXPAND: 256,

    // COLLECTION SIZES
    EXPAND_KEYS: 32,                    // relations pocketbase may expand into one record
    NOTE_LABELS: 50,
    VIEW_LABELS: 200,                   // labels one view includes or excludes
    VIEWS: 50,                          // views per user, the rail has to fit them

    // NUMBERS
    PAGE_NUMBER: 100000,
    PAGE_SIZE: 200,                     // records one fetch may pull
    TOTAL_ITEMS: 100000000,             // records a list response reports
    TOTAL_PAGES: 100000000,             // cannot beat the item count since a page holds at least one
    REMINDER_EVERY: 999,                // largest step between two reminders, in the chosen unit
    VIEW_AMOUNT: 999,                   // days, weeks or months a date filter reaches back or ahead
    VIEW_POSITION: 10000,

} as const;


// PRIMITIVES ==============================================
export function limitedText(label: string, max: number) {
    return z.string().max(max, `${label} must not be longer than ${max} characters.`)
}

export function limitedCount(label: string, max: number) {
    return z.number()
        .int(`${label} must be a whole number.`)
        .min(0, `${label} must not be negative.`)
        .max(max, `${label} must not be larger than ${max}.`)
}

export const idSchema = limitedText('Id', LIMITS.ID)
    .regex(/^[A-Za-z0-9_-]*$/, 'Id may only contain letters, numbers, underscores and dashes.');

export function isId(value: unknown): value is string { return idSchema.safeParse(value).success }

export const timestampSchema = limitedText('Timestamp', LIMITS.TIMESTAMP);
