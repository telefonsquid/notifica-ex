import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema, limitedText, type RecordModel } from '#lib/schemas/base.ts';
import { base64url, loginInputSchema } from '#lib/schemas/users.ts';
import z from 'zod';

// PASSKEYS ===================================================================
const encoded = (label: string, max: number) => limitedText(label, max).regex(/^[\w-]+$/, `${label} is malformed.`)
const credential = encoded('Passkey', LIMITS.PASSKEY_CREDENTIAL).min(1)
const answerPart = encoded('Passkey answer', LIMITS.PASSKEY_ANSWER)

// The key of locked notes, encrypted with one only this passkey can make
export type PasskeyNoteKey = z.infer<typeof passkeyNoteKeySchema>;
const passkeyNoteKeySchema = z.object({
    id: base64url(12),                                  // The note lock it opens
    iv: base64url(16),
    key: base64url(64)
});

export const startPasskeySchema = loginInputSchema.pick({ password: true });

// Extension results stay in the browser, they hold the secret that opens locked notes
export type PasskeyCreation = z.infer<typeof passkeyCreationSchema>;
const passkeyCreationSchema = z.object({
    id: credential,
    response: z.object({
        clientDataJSON: answerPart,
        attestationObject: answerPart,
        transports: z.array(limitedText('Transport', 32)).max(LIMITS.PASSKEY_TRANSPORTS)
    })
});

export const addPasskeySchema = z.object({
    name: limitedText('Passkey name', LIMITS.PASSKEY_NAME).trim().min(1, 'Passkey needs a name.'),
    prf: z.boolean(),
    creation: passkeyCreationSchema
});

export type PasskeyAnswer = z.infer<typeof passkeyAnswerSchema>;
export const passkeyAnswerSchema = z.object({
    id: credential,
    response: z.object({
        clientDataJSON: answerPart,
        authenticatorData: answerPart,
        signature: answerPart,
        userHandle: answerPart.optional()
    })
});

export const passkeyNoteKeyInputSchema = z.object({ id: idSchema, noteKey: passkeyNoteKeySchema });

export type Passkey = RecordModel & {
    owner: string;
    name: string;
    credential: string;                 // What the browser calls it
    publicKey: string;
    counter: number;                    // Stays 0 for passkeys that sync
    transports: string[] | null;
    prf: boolean;                       // Can open locked notes
    noteKey: PasskeyNoteKey | null;     // Null until it does
    lastUsed: string;
}

// What its owner's browser gets to see
export type PasskeySummary = Pick<Passkey, 'id' | 'name' | 'credential' | 'transports' | 'prf' | 'noteKey' | 'lastUsed' | 'created'>
