// LIMITS ==============================================
export const LIMITS = {

    // TEXT => IDENTIFIERS
    ID: 64,                             // pocketbase ids are 15 chars, client generated ones are uuids at 36
    RESET_TOKEN: 2048,                  // jwt from the set password link

    // TEXT => NAMES
    USER_NAME: 128,
    USER_EMAIL: 256,
    PASSWORD: 72,                       // bcrypt ignores anything past this
    PASSWORD_MIN: 8,
    LABEL_NAME: 64,
    AUTO_COLORS: 500,                   // labels in the auto color chart
    VIEW_NAME: 64,
    VIEW_ICON: 64,                      // a lucide icon name
    API_KEY_NAME: 64,
    NTFY_TOPIC: 64,                     // ntfy rejects longer topics
    PUSH_ENDPOINT: 1024,                // address a browser hands out for web push
    PUSH_P256DH: 256,                   // public key of a web push subscription
    PUSH_AUTH: 64,                      // auth secret of a web push subscription
    FILE_NAME: 128,                     // pocketbase stores a sanitized name plus a random suffix
    ATTACHMENT_NAME: 200,               // the name an attachment came with
    TIMEZONE: 64,                       // iana zone name like America/Argentina/Buenos_Aires
    IMPORT_SOURCE: 300,                 // where an imported note came from, like keep:Shopping.json

    // TEXT => NOTES
    NOTE_TITLE: 200,
    NOTE_BODY: 20000,
    OCCURRENCE_COMMENT: 500,            // a note on one check in the reminder history
    OCCURRENCE_RULE: 200,               // the rule line as it read then, many rules run longer

    // TEXT => VIEWS
    VIEW_WORDS: 200,                    // words a view looks for or leaves out
    VIEW_DATE: 10,                      // YYYY-MM-DD

    // COLLECTION SIZES
    NOTE_LABELS: 50,
    NOTE_IMAGES: 12,                    // matches maxSelect of the images field
    NOTE_ATTACHMENTS: 20,               // matches maxSelect of the attachments field
    NOTE_SHARES: 20,                    // matches maxSelect of the shared field
    VIEW_LABELS: 200,                   // labels one view includes or excludes
    VIEWS: 50,                          // views per user, the rail has to fit them
    API_KEYS: 20,                       // keys per user
    IMPORT_BATCH: 25,                   // notes one import call creates
    IMPORT_REMINDERS: 100,              // reminders an imported note brings along

    // NUMBERS
    PAGE_SIZE: 200,                     // records one fetch may pull
    API_KEY_DAYS: 3650,                 // longest a key may live before it expires
    REMINDER_EVERY: 999,                // largest step between two reminders, in the chosen unit
    REMINDER_RULES: 20,                 // only and except limits on one reminder
    VIEW_AMOUNT: 999,                   // days, weeks or months a date filter reaches back or ahead
    NOTE_POSITION: 1e15,                // a timestamp in ms or between two of them
    UPLOAD_BYTES: 100 * 1024 * 1024,    // most any one file may be, matches maxSize of both file fields and BODY_SIZE_LIMIT
    STORAGE_BYTES: 100 * 1024 ** 4,     // most an admin can grant one account

} as const;

export const UPLOAD_FORM_OVERHEAD = 64 * 1024     // bytes the form adds around one file, BODY_SIZE_LIMIT in the Dockerfile has room for both

// IMAGES ==============================================
export const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']     // matches mimeTypes of the images field
export const IMAGE_THUMB = '640x0'      // matches thumbs of the images field

