import { getRequestEvent } from '$app/server';
import type { CollectionMap, FetchOptions, Occurrence, Reminder } from '#lib/schemas.ts';
import { isOutage, outage } from '#lib/server/outage.ts';
import { getPbAdminConnection } from '#lib/server/pocketbase_admin_connection.ts';
import { error } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';
import type { CollectionModel, ListResult } from 'pocketbase';

// ERROR HANDLING
export type Result<T> =
    | { success: true; data: T; error: null }
    | { success: false; data: null; error: string };
async function pbErrorHandler<T>(promise: Promise<T>): Promise<Result<T>> {
    return promise
        .then(data => ({ success: true as const, data, error: null }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((err: any) => {
            if(isOutage(err)) outage() // No result to report, every caller would only misread it as a wrong input

            let errorMessage = err.message || 'An unexpected database error occurred.';

            // Field level details, formatted as "[name: Missing value, email: Invalid]"
            const validationErrors = err.response?.data || err.data;
            if(validationErrors && typeof validationErrors === 'object'){
                const details = Object.entries(validationErrors)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map(([field, errObj]: [string, any]) => `${field}: ${errObj?.message || 'Invalid'}`)
                    .join(', ');

                if(details) errorMessage += ` [${details}]`;
            }

            return {
                success: false as const,
                data: null,
                error: errorMessage
            };
        });
}

// One query as superuser
async function run<T>(query: (pb: PocketBase) => Promise<T>): Promise<Result<T>> {
    return pbErrorHandler(query(await getPbAdminConnection()))
}



// UNWRAP | the data of a successful result, a 400 with the database's reason otherwise
export function unwrap<T>(result: Result<T>, fallbackMessage?: string): NonNullable<T> {
    if(!result.success || !result.data){
        console.error(result)
        error(400, {
            message: fallbackMessage ?? result.error ?? 'Unknown Error',
            ...(result.error ? { details: result.error } : {})
        });
    }
    return result.data as NonNullable<T>;
}



// GENERIC FUNCTIONS =====================================================================

// GET
export async function getOne<K extends keyof CollectionMap>(collectionName: K, id: string, options?: FetchOptions) {
    return run((pb) => pb.collection(collectionName).getOne(id, options) as Promise<CollectionMap[K]>)
}

export async function getAll<K extends keyof CollectionMap>(collectionName: K, options?: FetchOptions) {
    return run((pb) => pb.collection(collectionName).getFullList(options) as Promise<CollectionMap[K][]>)
}

// INSERT
export async function insertOnePartial<K extends keyof CollectionMap>(collectionName: K, item: Partial<CollectionMap[K]>) {
    return run((pb) => pb.collection(collectionName).create(item) as Promise<CollectionMap[K]>)
}

// DELETE
export async function deleteOne<K extends keyof CollectionMap>(collectionName: K, id: string) {
    return run((pb) => pb.collection(collectionName).delete(id) as Promise<boolean>)
}

// UPDATE
export async function updateOnePartial<K extends keyof CollectionMap>(collectionName: K, id: string, item: Partial<CollectionMap[K]>) {
    return run((pb) => pb.collection(collectionName).update(id, item) as Promise<CollectionMap[K]>)
}

// FIND
// Values go in as {:name} placeholders through params, pocketbase escapes them
export async function findOne<K extends keyof CollectionMap>(collectionName: K, query: string, options?: FetchOptions, params?: Record<string, unknown>) {
    return run((pb) => pb.collection(collectionName).getFirstListItem(params ? pb.filter(query, params) : query, options) as Promise<CollectionMap[K]>)
}



// GENERIC COLLECTION FUNCTIONS
export async function getCollection<K extends keyof CollectionMap>(collectionName: K) {
    return run((pb) => pb.collections.getOne(collectionName))
}

export async function importCollections(collections: CollectionModel[]) {
    return run((pb) => pb.collections.import(collections, false))
}

export async function updateCollection(collectionName: string, data: Partial<CollectionModel>) {
    return run((pb) => pb.collections.update(collectionName, data))
}



// SETTINGS
export async function updateSettings(settings: Record<string, unknown>) {
    return run((pb) => pb.settings.update(settings))
}



// OWNED RECORDS =====================================================================
type OwnedCollection = 'labels' | 'notes' | 'occurrences' | 'push_subscriptions' | 'reminders' | 'views'

// Everything one user owns in a collection
export async function getAllOwned<K extends OwnedCollection>(collectionName: K, owner: string, options?: Omit<FetchOptions, 'filter'>) {
    return run((pb) => {
        const filter = pb.filter('owner = {:owner}', { owner })
        return pb.collection(collectionName).getFullList({ ...options, filter }) as Promise<CollectionMap[K][]>
    })
}

// Fails like a missing record when someone else owns it, so foreign ids reveal nothing
export async function getOwned<K extends OwnedCollection>(collectionName: K, id: string, owner: string) {
    return run((pb) => {
        const filter = pb.filter('id = {:id} && owner = {:owner}', { id, owner })
        return pb.collection(collectionName).getFirstListItem(filter) as Promise<CollectionMap[K]>
    })
}



// SHARED NOTES | the owner's notes plus the ones others shared with them
export async function getAllNotesFor(user: string, options?: Omit<FetchOptions, 'filter'>) {
    return run((pb) => {
        const filter = pb.filter('owner = {:user} || shared.id ?= {:user}', { user })
        return pb.collection('notes').getFullList({ ...options, filter }) as Promise<CollectionMap['notes'][]>
    })
}

export async function getNoteFor(id: string, user: string) {
    return run((pb) => {
        const filter = pb.filter('id = {:id} && (owner = {:user} || shared.id ?= {:user})', { id, user })
        return pb.collection('notes').getFirstListItem(filter) as Promise<CollectionMap['notes']>
    })
}

// Reminders people set on a note they no longer see | their history stays theirs
export async function deleteRemindersOn(note: string, owners: string[]) {
    return run(async (pb) => {
        if(!owners.length) return true
        const people = owners.map((owner, index) => pb.filter(`owner = {:owner${index}}`, { [`owner${index}`]: owner })).join(' || ')
        const found = await pb.collection('reminders').getFullList({ filter: `${pb.filter('note = {:note}', { note })} && (${people})`, fields: 'id' })
        for(const reminder of found){ await pb.collection('reminders').delete(reminder.id) }
        return true
    })
}

export async function leaveNote(id: string, user: string) {
    return run((pb) => pb.collection('notes').update(id, { 'shared-': [user] }) as Promise<CollectionMap['notes']>)
}



// SPECIFIC FUNCTIONS =====================================================================
export async function getDueReminders(now: Date) {
    return run((pb) => {
        const filter = pb.filter('next != "" && next <= {:now}', { now })
        return pb.collection('reminders').getFullList({ filter, expand: 'note,owner' }) as Promise<Reminder[]>
    })
}

// What a device missed while it had no connection, newest first
export async function getOccurrencesSince(owner: string, after: string, limit: number) {
    return run((pb) => {
        const filter = pb.filter('owner = {:owner} && created > {:after} && done = ""', { owner, after })   // What got checked off meanwhile stays quiet
        return pb.collection('occurrences').getList(1, limit, { filter, sort: '-created', expand: 'note', skipTotal: true }) as Promise<ListResult<Occurrence>>
    })
}

// HISTORY | newest first, one page at a time since a minute reminder logs a lot
export async function getOccurrences(note: string, owner: string, perPage: number) {
    return run((pb) => {
        const filter = pb.filter('note = {:note} && owner = {:owner}', { note, owner })
        return pb.collection('occurrences').getList(1, perPage, { filter, sort: '-at,-created' }) as Promise<ListResult<Occurrence>>
    })
}

// Times on a note still waiting for their Done button, oldest first
export async function getOpenOccurrences(note: string, owner: string) {
    return run((pb) => {
        const filter = pb.filter('note = {:note} && owner = {:owner} && task = true && done = ""', { note, owner })
        return pb.collection('occurrences').getFullList({ filter, sort: 'at', fields: 'id,reminder' }) as Promise<Pick<Occurrence, 'id' | 'reminder'>[]>
    })
}

// Keeps the count on the reminder in step with its log, the card badge and filters read it from there
export async function countOpenOccurrences(reminder: string) {
    return run(async (pb) => {
        const filter = pb.filter('reminder = {:reminder} && task = true && done = ""', { reminder })
        const page = await pb.collection('occurrences').getList(1, 1, { filter, fields: 'id' })
        return await pb.collection('reminders').update(reminder, { open: page.totalItems }) as Reminder
    })
}

// IMAGES | the files are protected, so every fetch needs a short lived token
let fileToken: { value: string, expires: number } | null = null

export async function fetchNoteImage(id: string, name: string, thumb?: string) {
    const pb = await getPbAdminConnection()
    if(!fileToken || fileToken.expires < Date.now()){
        fileToken = { value: await pb.files.getToken(), expires: Date.now() + 60_000 } // pocketbase keeps it valid for a few minutes
    }

    const url = new URL(`/api/files/notes/${encodeURIComponent(id)}/${encodeURIComponent(name)}`, pb.baseURL)
    url.searchParams.set('token', fileToken.value)
    if(thumb) url.searchParams.set('thumb', thumb)
    return await fetch(url)
}

// Appends to what the note already holds
export async function addNoteImages(id: string, files: File[]) {
    const form = new FormData()
    files.forEach((file) => form.append('images+', file))
    return run((pb) => pb.collection('notes').update(id, form) as Promise<CollectionMap['notes']>)
}

export async function removeNoteImage(id: string, name: string) {
    return run((pb) => pb.collection('notes').update(id, { 'images-': [name] }) as Promise<CollectionMap['notes']>)
}

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
    const pb = getRequestEvent().locals.pb // the request's own connection, so the hook can export its auth as a cookie
    return pbErrorHandler(pb.collection('users').authWithPassword(email, password))
}
