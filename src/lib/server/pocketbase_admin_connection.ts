import { INTERNAL_POCKETBASE_URL, POCKETBASE_SUPERUSER_EMAIL, POCKETBASE_SUPERUSER_PASSWORD } from '$app/env/private';
import { isOutage, outage } from '#lib/server/outage.ts';
import PocketBase from 'pocketbase';

let adminPb: PocketBase | null = null;
let authPromise: Promise<PocketBase> | null = null;

export async function getPbAdminConnection(): Promise<PocketBase> {

    // PB ALREADY INITIALIZED
    if(adminPb?.authStore.isValid){ return adminPb; }

    // ANOTHER REQUEST ALREADY AUTHENTICATING
    if(authPromise){ return authPromise; }

    authPromise = (async () => {

        const pb = new PocketBase(INTERNAL_POCKETBASE_URL);

        await pb
            .collection('_superusers')
            .authWithPassword(
                POCKETBASE_SUPERUSER_EMAIL,
                POCKETBASE_SUPERUSER_PASSWORD
            );

        pb.autoCancellation(false)
        adminPb = pb;
        return pb;

    })();

    try { return await authPromise; }
    catch(err) { if(isOutage(err)) outage(); throw err; }
    finally { authPromise = null; }
}
