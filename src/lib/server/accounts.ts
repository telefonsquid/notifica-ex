import { INTERNAL_POCKETBASE_URL } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import type { User } from '#lib/schemas/users.ts';
import { getOne, run, toResult } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import { error, type RequestEvent } from '@sveltejs/kit';
import PocketBase, { type RecordModel } from 'pocketbase';

// Route in pocketbase/cronjobs/session.pb.js
export const PB_SESSION_ROUTE = '/api/notifica/session'

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

// The request hook exports the auth as a cookie | deactivated accounts stay out
export function enter(event: RequestEvent): User {
    const { pb } = event.locals
    const user = structuredClone(pb.authStore.record) as unknown as User
    if(user.state === 'inactive'){
        pb.authStore.clear()
        error(403, 'This account is deactivated.')
    }

    event.locals.user = user
    return user
}

// Signs in without a password | only for someone who proved to own the account in another way
export async function openSession(id: string): Promise<User> {
    const event = getRequestEvent()
    const user = unwrap(await getOne('users', id), 'This account does not exist anymore.')

    const answer = await run((pb) => pb.send<{ token: string }>(`${PB_SESSION_ROUTE}/${id}`, { method: 'POST' }))
    if(!answer.success && answer.status === 404) error(501, 'Signing in with a passkey needs the current PocketBase image on this server.')

    event.locals.pb.authStore.save(unwrap(answer, 'Could not sign in.').token, user as unknown as RecordModel)
    return enter(event)
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
