import { getRequestEvent } from '$app/server';
import type { CollectionMap, FetchOptions, Occurrence, Reminder } from '#lib/schemas.ts';
import { getPbAdminConnection } from '#lib/server/pocketbase_admin_connection.ts';
import { error } from '@sveltejs/kit';
import type { CollectionModel, ListResult } from 'pocketbase';

// ERROR HANDLING
export type Result<T> =
    | { success: true; data: T; error: null }
    | { success: false; data: null; error: string };
export async function pbErrorHandler<T>(promise: Promise<T>): Promise<Result<T>> {
    return promise
        .then(data => ({ success: true as const, data, error: null }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((err: any) => {
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
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection(collectionName).getOne(id, options) as Promise<CollectionMap[K]>)
}

export async function getAll<K extends keyof CollectionMap>(collectionName: K, options?: FetchOptions) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection(collectionName).getFullList(options) as Promise<CollectionMap[K][]>)
}

// INSERT
export async function insertOnePartial<K extends keyof CollectionMap>(collectionName: K, item: Partial<CollectionMap[K]>) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection(collectionName).create(item) as Promise<CollectionMap[K]>)
}

// DELETE
export async function deleteOne<K extends keyof CollectionMap>(collectionName: K, id: string) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection(collectionName).delete(id) as Promise<boolean>)
}

// UPDATE
export async function updateOnePartial<K extends keyof CollectionMap>(collectionName: K, id: string, item: Partial<CollectionMap[K]>) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection(collectionName).update(id, item) as Promise<CollectionMap[K]>)
}

// FIND
export async function findOne<K extends keyof CollectionMap>(collectionName: K, query: string, options?: FetchOptions) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection(collectionName).getFirstListItem(query, options) as Promise<CollectionMap[K]>)
}



// GENERIC COLLECTION FUNCTIONS
export async function getCollection<K extends keyof CollectionMap>(collectionName: K) {
    const pb = await getPbAdminConnection();
    return await pbErrorHandler(pb.collections.getOne(collectionName));
}

export async function importCollections(collections: CollectionModel[]) {
    const pb = await getPbAdminConnection();
    return await pbErrorHandler(pb.collections.import(collections, false))
}

export async function updateCollection(collectionName: string, data: Partial<CollectionModel>) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collections.update(collectionName, data))
}



// SETTINGS
export async function updateSettings(settings: Record<string, unknown>) {
    const pb = await getPbAdminConnection();
    return await pbErrorHandler(pb.settings.update(settings))
}



// OWNED RECORDS =====================================================================
type OwnedCollection = 'labels' | 'notes' | 'occurrences' | 'reminders' | 'views'

// Everything one user owns in a collection
export async function getAllOwned<K extends OwnedCollection>(collectionName: K, owner: string, options?: Omit<FetchOptions, 'filter'>) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('owner = {:owner}', { owner })
    return await pbErrorHandler(pb.collection(collectionName).getFullList({ ...options, filter }) as Promise<CollectionMap[K][]>)
}

// Fails like a missing record when someone else owns it, so foreign ids reveal nothing
export async function getOwned<K extends OwnedCollection>(collectionName: K, id: string, owner: string) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('id = {:id} && owner = {:owner}', { id, owner })
    return await pbErrorHandler(pb.collection(collectionName).getFirstListItem(filter) as Promise<CollectionMap[K]>)
}



// SHARED NOTES | the owner's notes plus the ones others shared with them
export async function getAllNotesFor(user: string, options?: Omit<FetchOptions, 'filter'>) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('owner = {:user} || shared.id ?= {:user}', { user })
    return await pbErrorHandler(pb.collection('notes').getFullList({ ...options, filter }) as Promise<CollectionMap['notes'][]>)
}

export async function getNoteFor(id: string, user: string) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('id = {:id} && (owner = {:user} || shared.id ?= {:user})', { id, user })
    return await pbErrorHandler(pb.collection('notes').getFirstListItem(filter) as Promise<CollectionMap['notes']>)
}

// Reminders people set on a note they no longer see | their history stays theirs
export async function deleteRemindersOn(note: string, owners: string[]) {
    const pb = await getPbAdminConnection()
    if(!owners.length) return { success: true as const, data: 0, error: null }
    const people = owners.map((owner, index) => pb.filter(`owner = {:owner${index}}`, { [`owner${index}`]: owner })).join(' || ')
    const found = await pbErrorHandler(pb.collection('reminders').getFullList({ filter: `${pb.filter('note = {:note}', { note })} && (${people})`, fields: 'id' }))
    if(!found.success) return found
    for(const reminder of found.data){
        const deleted = await deleteOne('reminders', reminder.id)
        if(!deleted.success) return deleted
    }
    return { success: true as const, data: found.data.length, error: null }
}

export async function leaveNote(id: string, user: string) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection('notes').update(id, { 'shared-': [user] }) as Promise<CollectionMap['notes']>)
}



// SPECIFIC FUNCTIONS =====================================================================
export async function getDueReminders(now: Date) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('next != "" && next <= {:now}', { now })
    return await pbErrorHandler(pb.collection('reminders').getFullList({ filter, expand: 'note,owner' }) as Promise<Reminder[]>)
}

// HISTORY | newest first, one page at a time since a minute reminder logs a lot
export async function getOccurrences(note: string, owner: string, perPage: number) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('note = {:note} && owner = {:owner}', { note, owner })
    return await pbErrorHandler(pb.collection('occurrences').getList(1, perPage, { filter, sort: '-at,-created' }) as Promise<ListResult<Occurrence>>)
}

// Times on a note still waiting for their Done button, oldest first
export async function getOpenOccurrences(note: string, owner: string) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('note = {:note} && owner = {:owner} && task = true && done = ""', { note, owner })
    return await pbErrorHandler(pb.collection('occurrences').getFullList({ filter, sort: 'at', fields: 'id,reminder' }) as Promise<Pick<Occurrence, 'id' | 'reminder'>[]>)
}

// Keeps the count on the reminder in step with its log, the card badge and filters read it from there
export async function countOpenOccurrences(reminder: string) {
    const pb = await getPbAdminConnection()
    const filter = pb.filter('reminder = {:reminder} && task = true && done = ""', { reminder })
    const page = await pbErrorHandler(pb.collection('occurrences').getList(1, 1, { filter, fields: 'id' }))
    if(!page.success) return page
    return await updateOnePartial('reminders', reminder, { open: page.data.totalItems })
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
    const pb = await getPbAdminConnection()
    const form = new FormData()
    files.forEach((file) => form.append('images+', file))
    return await pbErrorHandler(pb.collection('notes').update(id, form) as Promise<CollectionMap['notes']>)
}

export async function removeNoteImage(id: string, name: string) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection('notes').update(id, { 'images-': [name] }) as Promise<CollectionMap['notes']>)
}

// Sends the set password mail, the same one invites use
export async function requestPasswordReset(email: string) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection('users').requestPasswordReset(email))
}

export async function confirmPasswordReset(token: string, password: string, passwordConfirm: string) {
    const pb = await getPbAdminConnection()
    return await pbErrorHandler(pb.collection('users').confirmPasswordReset(token, password, passwordConfirm))
}

export async function login(email: string, password: string) {
    const pb = getRequestEvent().locals.pb // the request's own connection, so the hook can export its auth as a cookie
    return await pbErrorHandler(pb.collection('users').authWithPassword(email, password))
}
