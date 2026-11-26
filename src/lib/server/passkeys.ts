import { ORIGIN } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { LIMITS } from '#lib/schema_limits.ts';
import type { Passkey, PasskeyAnswer, PasskeyCreation, PasskeyNoteKey, PasskeySummary } from '#lib/schemas/passkeys.ts';
import type { User } from '#lib/schemas/users.ts';
import { ANDROID_ORIGIN } from '#lib/server/android_app.ts';
import { isOpenChallenge, issueChallenge, spendChallenge } from '#lib/server/passkey_challenges.ts';
import { deleteOne, findOne, getAllOwned, getOwned, insertOnePartial, updateOnePartial } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { hasValidSignature, sign } from '#lib/server/server_auth.ts';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { error } from '@sveltejs/kit';

/*
    Passkeys sign someone in without their password and, where the device can, open their locked notes.
    The server only keeps public keys and locked keys it can't open.
*/

const APP_NAME = 'Notifica Ex'
const SUMMARY_FIELDS = 'id,name,credential,transports,prf,noteKey,lastUsed,created'

// EdDSA, ES256 and RS256, every passkey knows one of them
const ALGORITHMS = [-8, -7, -257]

const LOGIN = 'login'
const addFor = (user: string) => `add:${user}`

// Passkeys belong to the host people open | the app answers with its own origin
function site() {
    const { origin, hostname } = new URL(ORIGIN ?? getRequestEvent().url.origin)
    return { rpID: hostname, expectedOrigin: [origin, ANDROID_ORIGIN] }
}

function challengeOf(clientDataJSON: string): string {
    return JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString()).challenge
}

const expecting = (purpose: string) => (challenge: string) => isOpenChallenge(challenge, purpose, hasValidSignature)



// MANAGING ===================================================================================================
export async function listPasskeys(owner: string) {
    return unwrap(await getAllOwned('passkeys', owner, { sort: '-created', fields: SUMMARY_FIELDS }), 'Could not load the passkeys.') as PasskeySummary[]
}

export async function creationOptions(owner: User) {
    const existing = await listPasskeys(owner.id)
    if(existing.length >= LIMITS.PASSKEYS) error(400, `An account holds at most ${LIMITS.PASSKEYS} passkeys.`)

    return generateRegistrationOptions({
        rpName: APP_NAME,
        rpID: site().rpID,
        userID: new TextEncoder().encode(owner.id),
        userName: owner.email,
        userDisplayName: owner.name,
        challenge: issueChallenge(addFor(owner.id), sign),
        attestationType: 'none',
        supportedAlgorithmIDs: ALGORITHMS,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: existing.map(({ credential, transports }) => ({ id: credential, transports: transports ?? undefined }))
    })
}

export async function addPasskey(owner: User, { name, prf, creation }: { name: string, prf: boolean, creation: PasskeyCreation }) {
    const { rpID, expectedOrigin } = site()

    const { registrationInfo } = await verifyRegistrationResponse({
        response: { ...creation, rawId: creation.id, type: 'public-key', clientExtensionResults: {} },
        expectedChallenge: expecting(addFor(owner.id)),
        expectedOrigin,
        expectedRPID: rpID,
        supportedAlgorithmIDs: ALGORITHMS
    }).catch(rejected)

    if(!registrationInfo || registrationInfo.credential.id !== creation.id || !spendChallenge(challengeOf(creation.response.clientDataJSON))) return refuse()

    const { credential } = registrationInfo
    const stored = unwrap(await insertOnePartial('passkeys', {
        owner: owner.id,
        name,
        prf,
        credential: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: creation.response.transports
    }), 'Could not save the passkey.')

    return summaryOf(stored)
}

export async function saveNoteKey(id: string, owner: User, noteKey: PasskeyNoteKey) {
    unwrap(await getOwned('passkeys', id, owner.id), 'Passkey not found.')
    if(noteKey.id !== owner.noteLock?.id) error(409, 'Your locked notes use another key by now, reload the page.')
    unwrap(await updateOnePartial('passkeys', id, { noteKey }), 'Could not save the passkey.')
}

export async function removePasskey(id: string, owner: string) {
    unwrap(await getOwned('passkeys', id, owner), 'Passkey not found.')
    unwrap(await deleteOne('passkeys', id), 'Could not remove the passkey.')
}

function summaryOf({ id, name, credential, transports, prf, noteKey, lastUsed, created }: Passkey): PasskeySummary {
    return { id, name, credential, transports, prf, noteKey, lastUsed, created }
}



// SIGNING IN =================================================================================================

// No list of passkeys, so it tells nobody which accounts exist
export async function loginOptions() {
    return generateAuthenticationOptions({
        rpID: site().rpID,
        challenge: issueChallenge(LOGIN, sign),
        userVerification: 'required'
    })
}

// The id of the account whose passkey answered
export async function ownerOfAnswer(answer: PasskeyAnswer): Promise<string> {
    const { rpID, expectedOrigin } = site()

    const passkey = orNull(await findOne('passkeys', 'credential = {:credential}', undefined, { credential: answer.id }), 'Could not check the passkey.')
    if(!passkey) error(400, 'This passkey is not known here. Log in with your password.')

    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response: { ...answer, rawId: answer.id, type: 'public-key', clientExtensionResults: {} },
        expectedChallenge: expecting(LOGIN),
        expectedOrigin,
        expectedRPID: rpID,
        credential: {
            id: passkey.credential,
            publicKey: Uint8Array.from(Buffer.from(passkey.publicKey, 'base64url')),
            counter: passkey.counter
        }
    }).catch(rejected)

    const { userHandle, clientDataJSON } = answer.response
    const sameOwner = !userHandle || Buffer.from(userHandle, 'base64url').toString() === passkey.owner
    if(!verified || !sameOwner || !spendChallenge(challengeOf(clientDataJSON))) return refuse()

    unwrap(await updateOnePartial('passkeys', passkey.id, { counter: authenticationInfo.newCounter, lastUsed: new Date().toISOString() }), 'Could not check the passkey.')
    return passkey.owner
}

// The reason goes to the log, the person only needs to know it failed
function rejected(reason: unknown): never {
    console.error('Passkey refused:', reason)
    return refuse()
}

function refuse(): never {
    error(400, 'This passkey was not accepted. Try again.')
}
