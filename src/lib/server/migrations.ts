import { getAll, getCollection, importCollections, insertOnePartial, updateCollection, updateOnePartial } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';
import type { NoteColor } from '#lib/schemas/notes.ts';
import type { CollectionModel } from 'pocketbase';
import pbSchema from '../../../pocketbase/pb_schema.json';

/*
    Changes an existing install needs to reach this release, oldest first. Each runs once and
    gets recorded in the migrations collection. A fresh install gets the whole schema instead
    and only records them.
*/

type Migration = { version: string, run: () => Promise<void> }

const MIGRATIONS: Migration[] = [
    { version: '0.3.0', run: () => addCollections('api_keys') },
    { version: '0.3.0-locked-notes', run: async () => { await addFields('notes', 'sealed'); await addFields('users', 'noteLock') } },
    { version: '0.4.0-colors', run: async () => {
        await syncSelect('labels', 'color')
        await syncSelect('notes', 'color')
        await addFields('notes', 'colorDefault')
        await addFields('users', 'noteColor')
    } },
    { version: '0.4.0-patterns', run: async () => {
        await syncSelect('labels', 'color')
        await syncSelect('notes', 'color')
        await syncSelect('users', 'noteColor')
        await renameColor('terrazzo', 'sakura')
        await renameColor('marble', 'subway')
        await renameColor('lava', 'sunburst')
    } },
    { version: '0.4.0-flags', run: async () => {
        await syncSelect('labels', 'color')
        await syncSelect('notes', 'color')
        await syncSelect('users', 'noteColor')
    } },
    { version: '0.4.0-asexual-flag', run: async () => {
        await syncSelect('labels', 'color')
        await syncSelect('notes', 'color')
        await syncSelect('users', 'noteColor')
        await renameColor('agender-flag', 'asexual-flag')
    } }
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

type Collection = 'notes' | 'users' | 'labels'

// Keeps the collection's other fields, its rules and its data
async function addFields(collection: Collection, ...names: string[]) {
    const live = unwrap(await getCollection(collection), `Could not read ${collection}.`)
    const wanted = (pbSchema as unknown as CollectionModel[]).find((model) => model.name === collection)?.fields ?? []
    const missing = wanted.filter((field) => names.includes(field.name) && !live.fields.some((have) => have.name === field.name))
    if(missing.length) unwrap(await updateCollection(collection, { fields: [...live.fields, ...missing] }), `Could not add ${names.join(', ')} to ${collection}.`)
}

// New choices for a select field | values stored before stay valid
async function syncSelect(collection: Collection, name: string) {
    const live = unwrap(await getCollection(collection), `Could not read ${collection}.`)
    const wanted = (pbSchema as unknown as CollectionModel[]).find((model) => model.name === collection)?.fields.find((field) => field.name === name)
    if(!wanted?.values) return
    const fields = live.fields.map((field) => field.name === name ? { ...field, values: [...new Set([...(field.values ?? []), ...wanted.values])] } : field)
    unwrap(await updateCollection(collection, { fields }), `Could not update ${name} in ${collection}.`)
}

// A retired pattern hands its notes, labels and account defaults to the one that replaced it
async function renameColor(from: string, to: NoteColor) {
    const places = [['notes', 'color'], ['labels', 'color'], ['users', 'noteColor']] as const
    for(const [collection, field] of places){
        const found = unwrap(await getAll(collection, { filter: `${field} = "${from}"`, fields: 'id' }), `Could not read ${collection}.`)
        for(const record of found) unwrap(await updateOnePartial(collection, record.id, { [field]: to }), `Could not recolor ${collection} ${record.id}.`)
    }
}
