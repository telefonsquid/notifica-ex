import { LIMITS } from '#lib/schema_limits.ts';
import z from 'zod';

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



// POCKETBASE ==============================================

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
