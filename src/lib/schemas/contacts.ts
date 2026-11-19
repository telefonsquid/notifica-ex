import type { RecordModel } from '#lib/schemas/base.ts';

// CONTACTS ===================================================================

// A link one person hands out, whoever opens it becomes a contact of both
export type Invite = RecordModel & {
    owner: string;
    hash: string;           // The link itself is only shown once
    expires: string;
}

// One row each way, so either side lists the other
export type Contact = RecordModel & {
    owner: string;
    person: string;
}

// What the settings list gets to see
export type InviteSummary = Pick<Invite, 'id' | 'expires' | 'created'>
