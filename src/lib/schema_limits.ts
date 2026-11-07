// LIMITS ==============================================
export const LIMITS = {

    // TEXT => IDENTIFIERS
    ID: 64,                             // pocketbase ids are 15 chars, client generated ones are uuids at 36
    RESET_TOKEN: 2048,                  // jwt from the set password link

    // TEXT => NAMES
    USER_NAME: 128,
    USER_EMAIL: 256,
    PASSWORD: 72,                       // bcrypt ignores anything past this
    LABEL_NAME: 64,
    AUTO_COLORS: 500,                   // labels in the auto color chart
    VIEW_NAME: 64,
    VIEW_ICON: 64,                      // a lucide icon name
    NTFY_TOPIC: 64,                     // ntfy rejects longer topics
    PUSH_ENDPOINT: 1024,                // address a browser hands out for web push
    PUSH_KEY: 256,                      // keys of a web push subscription
    FILE_NAME: 128,                     // pocketbase stores a sanitized name plus a random suffix
    TIMEZONE: 64,                       // iana zone name like America/Argentina/Buenos_Aires

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
    NOTE_SHARES: 20,                    // matches maxSelect of the shared field
    VIEW_LABELS: 200,                   // labels one view includes or excludes
    VIEWS: 50,                          // views per user, the rail has to fit them

    // NUMBERS
    PAGE_SIZE: 200,                     // records one fetch may pull
    REMINDER_EVERY: 999,                // largest step between two reminders, in the chosen unit
    REMINDER_RULES: 20,                 // only and except limits on one reminder
    VIEW_AMOUNT: 999,                   // days, weeks or months a date filter reaches back or ahead
    NOTE_POSITION: 1e15,                // a timestamp in ms or between two of them
    IMAGE_BYTES: 15 * 1024 * 1024,      // one uploaded image, matches maxSize of the images field

} as const;

