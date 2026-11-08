import type { NoteLock } from '#lib/schemas/users.ts';

/*
    Encryption of locked notes, all of it in the browser. One random key per account seals the bodies,
    a key derived from the account password locks that one, so a new password only locks it again.
    Sealed bodies read v1.<key id>.<iv>.<ciphertext>, base64url throughout.
*/

// OWASP's advice for PBKDF2 with SHA256
export const LOCK_ITERATIONS = 600_000

const VERSION = 'v1'
const text = new TextEncoder()



// ENCODING ===================================================================================================
export function toBase64(bytes: Uint8Array): string {
    let binary = ''
    for(const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function fromBase64(encoded: string): Uint8Array<ArrayBuffer> {
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function random(length: number) {
    return crypto.getRandomValues(new Uint8Array(length))
}



// ACCOUNT KEY ================================================================================================
async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
    const base = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

// Kept from export, a script on the page can use it but never carry it off
function noteKey(raw: Uint8Array<ArrayBuffer>) {
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

// The id goes into the tag, so a lock can't pass for another
async function lockRaw(raw: Uint8Array<ArrayBuffer>, id: string, password: string, iterations: number): Promise<NoteLock> {
    const salt = random(16)
    const iv = random(12)
    const kek = await passwordKey(password, salt, iterations)
    const key = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: text.encode(id) }, kek, raw))
    return { id, salt: toBase64(salt), iterations, iv: toBase64(iv), key: toBase64(key) }
}

// Null for a wrong password
async function rawOf(lock: NoteLock, password: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const kek = await passwordKey(password, fromBase64(lock.salt), lock.iterations)
    try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(lock.iv), additionalData: text.encode(lock.id) }, kek, fromBase64(lock.key)))
    } catch {
        return null
    }
}

export async function createLock(password: string, iterations = LOCK_ITERATIONS): Promise<{ lock: NoteLock, key: CryptoKey }> {
    const raw = random(32)
    const lock = await lockRaw(raw, toBase64(random(9)), password, iterations)
    const key = await noteKey(raw)
    raw.fill(0)
    return { lock, key }
}

export async function openLock(lock: NoteLock, password: string): Promise<CryptoKey | null> {
    const raw = await rawOf(lock, password)
    if(!raw) return null
    const key = await noteKey(raw)
    raw.fill(0)
    return key
}

// Same key under a new password, the sealed notes stay as they are
export async function relock(lock: NoteLock, oldPassword: string, password: string): Promise<NoteLock | null> {
    const raw = await rawOf(lock, oldPassword)
    if(!raw) return null
    const next = await lockRaw(raw, lock.id, password, lock.iterations)
    raw.fill(0)
    return next
}



// NOTE BODIES ================================================================================================
export function keyOf(sealed: string): string {
    return sealed.split('.')[1] ?? ''
}

export async function seal(key: CryptoKey, keyId: string, body: string): Promise<string> {
    const head = `${VERSION}.${keyId}`
    const iv = random(12)
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: text.encode(head) }, key, text.encode(body)))
    return `${head}.${toBase64(iv)}.${toBase64(data)}`
}

// Null when the key doesn't fit or the text was tampered with
export async function unseal(key: CryptoKey, sealed: string): Promise<string | null> {
    const [version, keyId, iv, data] = sealed.split('.')
    if(version !== VERSION || !keyId || !iv || !data) return null
    try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: text.encode(`${version}.${keyId}`) }, key, fromBase64(data))
        return new TextDecoder().decode(plain)
    } catch {
        return null
    }
}
