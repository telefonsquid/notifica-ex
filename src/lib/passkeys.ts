import { fromBase64, toBase64 } from '#lib/note_crypto.ts';
import type { PasskeyAnswer, PasskeyCreation, PasskeySummary } from '#lib/schemas/passkeys.ts';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialDescriptorJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';

/*
    The browser's side of passkeys. The server speaks base64url, the browser wants bytes.
    What a passkey gives to open locked notes never leaves this device.
*/

type Secret = Uint8Array<ArrayBuffer>

// Never change it, passkeys answer with another secret then
const SECRET_FOR = new TextEncoder().encode('notifica-ex locked notes')

// Browsers refuse bare IP addresses | an older Android app can't reach the phone's passkeys
export function passkeysAvailable(): boolean {
    if(typeof window === 'undefined' || !window.PublicKeyCredential) return false
    if(/^\[|^[\d.]+$/.test(location.hostname)) return false
    return !window.NotificaAndroid || !!window.NotificaAndroid.passkeysSupported?.()
}

export async function autofillAvailable(): Promise<boolean> {
    return passkeysAvailable() && !!await PublicKeyCredential.isConditionalMediationAvailable?.()
}

function descriptors(list: PublicKeyCredentialDescriptorJSON[] = []): PublicKeyCredentialDescriptor[] {
    return list.map(({ id, transports }) => ({ id: fromBase64(id), type: 'public-key', transports: transports as AuthenticatorTransport[] | undefined }))
}

function secretFrom(credential: PublicKeyCredential): Secret | null {
    const first = credential.getClientExtensionResults().prf?.results?.first
    if(!first) return null
    return first instanceof ArrayBuffer ? new Uint8Array(first) : new Uint8Array(first.buffer as ArrayBuffer, first.byteOffset, first.byteLength)
}

const encoded = (buffer: ArrayBuffer) => toBase64(new Uint8Array(buffer))

// Closing the browser's dialog, waiting too long and an abort all end here
function isCancelled(err: unknown) {
    return err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')
}

export function passkeyProblem(err: unknown): string {
    if(err instanceof DOMException && err.name === 'InvalidStateError') return 'This device already has a passkey for your account.'
    return (err as { body?: { message?: string } })?.body?.message ?? 'The passkey did not work on this device.'
}



// CREATING ===================================================================================================
// Null when cancelled | prf says it can open locked notes, some hand out the secret only when used
export async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON): Promise<{ creation: PasskeyCreation, prf: boolean, secret: Secret | null } | null> {
    const credential = await navigator.credentials.create({ publicKey: {
        rp: options.rp,
        user: { ...options.user, id: fromBase64(options.user.id) },
        challenge: fromBase64(options.challenge),
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        attestation: 'none',
        timeout: options.timeout,
        excludeCredentials: descriptors(options.excludeCredentials),
        extensions: { prf: { eval: { first: SECRET_FOR } } }
    } }).catch(cancelled) as PublicKeyCredential | null
    if(!credential) return null

    const response = credential.response as AuthenticatorAttestationResponse
    const secret = secretFrom(credential)
    return {
        secret,
        prf: !!secret || !!credential.getClientExtensionResults().prf?.enabled,
        creation: {
            id: encoded(credential.rawId),
            response: {
                clientDataJSON: encoded(response.clientDataJSON),
                attestationObject: encoded(response.attestationObject),
                transports: response.getTransports?.() ?? []
            }
        }
    }
}

function cancelled(err: unknown): null {
    if(isCancelled(err)) return null
    throw err
}



// SIGNING IN =================================================================================================
// Null when cancelled | with a signal it waits in the email field's suggestions instead of a dialog
export async function answerWithPasskey(options: PublicKeyCredentialRequestOptionsJSON, signal?: AbortSignal): Promise<PasskeyAnswer | null> {
    const credential = await navigator.credentials.get({
        signal,
        mediation: signal ? 'conditional' : undefined,
        publicKey: {
            challenge: fromBase64(options.challenge),
            rpId: options.rpId,
            timeout: options.timeout,
            userVerification: options.userVerification
        }
    }).catch(cancelled) as PublicKeyCredential | null
    if(!credential) return null

    const response = credential.response as AuthenticatorAssertionResponse
    return {
        id: encoded(credential.rawId),
        response: {
            clientDataJSON: encoded(response.clientDataJSON),
            authenticatorData: encoded(response.authenticatorData),
            signature: encoded(response.signature),
            userHandle: response.userHandle ? encoded(response.userHandle) : undefined
        }
    }
}



// LOCKED NOTES ===============================================================================================
// Null when cancelled | the answer stays here, so the challenge is only there to fill its place
export async function passkeySecret(passkeys: Pick<PasskeySummary, 'credential' | 'transports'>[]): Promise<{ credential: string, secret: Secret } | null> {
    const credential = await navigator.credentials.get({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: 'required',
        allowCredentials: descriptors(passkeys.map(({ credential, transports }) => ({ id: credential, type: 'public-key', transports: transports as PublicKeyCredentialDescriptorJSON['transports'] }))),
        extensions: { prf: { eval: { first: SECRET_FOR } } }
    } }).catch(cancelled) as PublicKeyCredential | null
    if(!credential) return null

    const secret = secretFrom(credential)
    if(!secret) throw new Error('No secret')
    return { credential: encoded(credential.rawId), secret }
}
