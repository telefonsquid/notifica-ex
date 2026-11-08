import { LIMITS } from '#lib/schema_limits.ts';
import { limitedText, type RecordModel } from '#lib/schemas/base.ts';
import z from 'zod';

// API KEYS ===================================================================

// Read only keys can look but never change anything
export const API_KEY_SCOPES = ['read', 'write'] as const
export type ApiKeyScope = typeof API_KEY_SCOPES[number]

export const apiKeyInputSchema = z.object({
    name: limitedText('Key name', LIMITS.API_KEY_NAME).trim().min(1, 'Key needs a name.'),
    scope: z.enum(API_KEY_SCOPES),
    days: z.number().int().min(1).max(LIMITS.API_KEY_DAYS).nullable()      // Null never expires
});

export type ApiKey = RecordModel & {
    owner: string;
    name: string;
    prefix: string;         // The start of the key, so the list tells them apart
    hash: string;           // The key itself is only shown once
    scope: ApiKeyScope;
    expires: string;        // Empty never expires
    lastUsed: string;
}

// What the settings list gets to see
export type ApiKeySummary = Pick<ApiKey, 'id' | 'name' | 'prefix' | 'scope' | 'expires' | 'lastUsed' | 'created'>
