import { getRequestEvent } from '$app/server';
import { run, toResult } from '#lib/server/queries.ts';

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
