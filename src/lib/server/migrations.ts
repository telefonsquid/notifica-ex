import { getAll, importCollections, insertOnePartial } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import type { CollectionModel } from 'pocketbase';
import pbSchema from '../../../pocketbase/pb_schema.json';

/*
    Changes an existing install needs to reach this release, oldest first. Each runs once and
    gets recorded in the migrations collection. A fresh install gets the whole schema instead
    and only records them.
*/

type Migration = { version: string, run: () => Promise<void> }

const MIGRATIONS: Migration[] = [
    { version: '0.3.0', run: () => addCollections('api_keys') }
]



// RUNNING ====================================================================================================
export async function runMigrations() {
    const done = await completedVersions()
    for(const migration of MIGRATIONS){
        if(done.has(migration.version)) continue
        await migration.run()
        await record(migration.version)
    }
}

// The schema it got already holds what they add
export async function skipMigrations() {
    const done = await completedVersions()
    for(const migration of MIGRATIONS){
        if(!done.has(migration.version)) await record(migration.version)
    }
}

async function completedVersions() {
    const found = unwrap(await getAll('migrations', { filter: 'completed = true', fields: 'version' }), 'Could not read the migrations.')
    return new Set(found.map((migration) => migration.version))
}

async function record(version: string) {
    unwrap(await insertOnePartial('migrations', { version, completed: true }), `Could not record migration ${version}.`)
}



// STEPS ======================================================================================================

// Leaves every other collection as it is
async function addCollections(...names: string[]) {
    const added = (pbSchema as unknown as CollectionModel[]).filter((collection) => names.includes(collection.name))
    unwrap(await importCollections(added), `Could not add ${names.join(', ')}.`)
}
