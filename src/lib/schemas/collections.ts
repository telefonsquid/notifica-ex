import type { ApiKey } from '#lib/schemas/api_keys.ts';
import type { Contact, Invite } from '#lib/schemas/contacts.ts';
import type { RecordModel } from '#lib/schemas/base.ts';
import type { Label, Note } from '#lib/schemas/notes.ts';
import type { Occurrence, Reminder } from '#lib/schemas/reminders.ts';
import type { Passkey } from '#lib/schemas/passkeys.ts';
import type { FileLimits, PushSubscriptionRecord, User } from '#lib/schemas/users.ts';
import type { View } from '#lib/schemas/views.ts';
import type { RecordAuthResponse } from 'pocketbase';

export type CollectionMap = {
    'users': User;
    'migrations': Migration;
    'labels': Label;
    'notes': Note;
    'reminders': Reminder;
    'occurrences': Occurrence;
    'views': View;
    'push_subscriptions': PushSubscriptionRecord;
    'app_settings': AppSettings;
    'api_keys': ApiKey;
    'passkeys': Passkey;
    'invites': Invite;
    'contacts': Contact;
    '_superusers': RecordAuthResponse<RecordModel>;
}

export type Collection = keyof CollectionMap;

export type Migration = RecordModel & {
    version: string; // App release this migration belongs to
    completed: boolean;
}

// The one record holding what an admin set for everyone
export type AppSettings = RecordModel & { limits: Partial<FileLimits> | null }
