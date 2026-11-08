import type { FetchOptions } from '#lib/schemas/base.ts';
import type { CollectionMap } from '#lib/schemas/collections.ts';
import { isOutage, outage } from '#lib/server/outage.ts';
import { getPbAdminConnection } from '#lib/server/pocketbase_admin_connection.ts';
import type { Result } from '#lib/server/result.ts';
import type PocketBase from 'pocketbase';
import type { CollectionModel } from 'pocketbase';

// ERROR HANDLING
export async function toResult<T>(promise: Promise<T>): Promise<Result<T>> {
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
                error: errorMessage,
                status: err.status
            };
        });
}

// One query as superuser
export async function run<T>(query: (pb: PocketBase) => Promise<T>): Promise<Result<T>> {
    return toResult(query(await getPbAdminConnection()))
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
