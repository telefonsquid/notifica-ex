import { INTERNAL_POCKETBASE_URL } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { run, toResult } from '#lib/server/queries.ts';
import PocketBase from 'pocketbase';

// Sends the set password mail, the same one invites use
export async function requestPasswordReset(email: string) {
    return run((pb) => pb.collection('users').requestPasswordReset(email))
}

export async function confirmPasswordReset(token: string, password: string, passwordConfirm: string) {
    return run((pb) => pb.collection('users').confirmPasswordReset(token, password, passwordConfirm))
}

// Old stream keys stop working, the number is part of what they sign
export async function renewStreamKey(user: string) {
    return run((pb) => pb.collection('users').update(user, { 'streamEpoch+': 1 }))
}

export async function login(email: string, password: string) {
    const pb = getRequestEvent().locals.pb // The request's own connection, so the hook can export its auth as a cookie
    return toResult(pb.collection('users').authWithPassword(email, password))
}

// Checks a password without touching the request's session
export async function passwordMatches(email: string, password: string): Promise<boolean> {
    const result = await toResult(new PocketBase(INTERNAL_POCKETBASE_URL).collection('users').authWithPassword(email, password))
    return result.success
}

// The account a set password link belongs to | read only, PocketBase checks the signature on use
export function userOfToken(token: string): string | null {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).id ?? null
    } catch {
        return null
    }
}
