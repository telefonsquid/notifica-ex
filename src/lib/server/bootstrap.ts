import { dev } from '$app/env';
import * as env from '$app/env/private';
import type { CollectionMap } from '#lib/schemas/collections.ts';
import { findOne, getCollection, importCollections, insertOnePartial, updateCollection, updateSettings } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import type { CollectionModel } from 'pocketbase';
import pbSchema from '../../../pocketbase/pb_schema.json';

export async function bootstrap(){ // setup for a fresh pocketbase install

    // CREATE SCHEMA ON FRESH INSTALL
    if(await isFreshInstall()){
        await createSchema()
    }
    else if(dev){
        await createSchema() // no versioned migrations before the first release, local dev follows pb_schema.json
        await dropRetiredFields()
    }

    // CREATE REQUIRED DATABASE ENTRIES
    await createFirstUser() // only creates one if no user exists

    // FORCE POCKETBASE SETTINGS
    await forcePocketbaseSettings()

}

async function isFreshInstall(){
    return !orNull(await getCollection('migrations'), 'Could not look for the schema.')
}

async function createSchema(){
    unwrap(await importCollections(pbSchema as unknown as CollectionModel[]))
}

// The import only adds and changes fields | ones gone from pb_schema.json would linger and may still be required
async function dropRetiredFields(){
    for(const collection of pbSchema as unknown as CollectionModel[]){
        const existing = unwrap(await getCollection(collection.name as keyof CollectionMap))
        const kept = new Set(collection.fields.map((field) => field.name))
        const fields = existing.fields.filter((field) => kept.has(field.name))
        if(fields.length === existing.fields.length){ continue }
        unwrap(await updateCollection(collection.name, { fields }))
    }
}

async function createFirstUser(){

    if(orNull(await findOne('users', 'id != ""'), 'Could not look for users.')){ return }

    unwrap(await insertOnePartial('users', { // first user mirrors the pb superuser and should be changed after first login
        email: env.POCKETBASE_SUPERUSER_EMAIL,
        password: env.POCKETBASE_SUPERUSER_PASSWORD,
        passwordConfirm: env.POCKETBASE_SUPERUSER_PASSWORD,
        name: 'Admin',
        authorizationLevel: 'admin',
        state: 'active',
        verified: true,
        emailVisibility: false
    }))

}

async function forcePocketbaseSettings(){

    if(dev){ return } // local dev shares test pocketbase, so its urls must not leak into it

    const meta: Record<string, unknown> = {}
    if(env.ORIGIN){ meta.appURL = env.ORIGIN }
    if(env.POCKETBASE_APP_NAME){ meta.appName = env.POCKETBASE_APP_NAME }
    if(env.SMTP_SENDER_NAME){ meta.senderName = env.SMTP_SENDER_NAME }
    if(env.SMTP_SENDER_ADDRESS){ meta.senderAddress = env.SMTP_SENDER_ADDRESS }

    const smtp: Record<string, unknown> = {}
    if(env.SMTP_HOST){ smtp.host = env.SMTP_HOST; smtp.enabled = true }
    if(env.SMTP_PORT){ smtp.port = env.SMTP_PORT }
    if(env.SMTP_USERNAME){ smtp.username = env.SMTP_USERNAME }
    if(env.SMTP_PASSWORD){ smtp.password = env.SMTP_PASSWORD }
    if(env.SMTP_TLS !== undefined){ smtp.tls = env.SMTP_TLS }

    const settings: Record<string, unknown> = {}
    if(Object.keys(meta).length > 0){ settings.meta = meta }
    if(Object.keys(smtp).length > 0){ settings.smtp = smtp }
    if(Object.keys(settings).length === 0){ return }

    unwrap(await updateSettings(settings))

}
