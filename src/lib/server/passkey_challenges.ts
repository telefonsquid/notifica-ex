import { randomBytes } from 'node:crypto';

/*
    The random bytes a passkey signs. Nothing is stored for an open one: the challenge carries its own
    end and a signature over what it is for, only used ones are remembered until that end.
*/

// Long enough to find a phone or a security key
export const CHALLENGE_LASTS = 10 * 60 * 1000

const NONCE_BYTES = 16
const END_BYTES = 6
const SIGNATURE_BYTES = 32
const HEAD_BYTES = NONCE_BYTES + END_BYTES

// Returns hex, i.e. sign() from server_auth.ts
type Sign = (subject: string) => string

function signatureOf(head: Buffer, purpose: string, sign: Sign) {
    return Buffer.from(sign(`passkey-${purpose}:${head.toString('hex')}`), 'hex')
}

export function issueChallenge(purpose: string, sign: Sign, now = Date.now()): Uint8Array<ArrayBuffer> {
    const end = Buffer.alloc(END_BYTES)
    end.writeUIntBE(now + CHALLENGE_LASTS, 0, END_BYTES)

    const head = Buffer.concat([randomBytes(NONCE_BYTES), end])
    return Uint8Array.from(Buffer.concat([head, signatureOf(head, purpose, sign)]))
}

// Null for one made for something else, made up or too old
function endOf(challenge: string, purpose: string, matches: (subject: string, signature: string) => boolean, now: number): number | null {
    const bytes = Buffer.from(challenge, 'base64url')
    if(bytes.length !== HEAD_BYTES + SIGNATURE_BYTES) return null

    const head = bytes.subarray(0, HEAD_BYTES)
    if(!matches(`passkey-${purpose}:${head.toString('hex')}`, bytes.subarray(HEAD_BYTES).toString('hex'))) return null

    const end = head.readUIntBE(NONCE_BYTES, END_BYTES)
    return end > now ? end : null
}

export function isOpenChallenge(challenge: string, purpose: string, matches: (subject: string, signature: string) => boolean, now = Date.now()): boolean {
    return !used.has(challenge) && endOf(challenge, purpose, matches, now) !== null
}



// SINGLE USE =================================================================================================
const used = new Map<string, number>()

// False when it was used before | call once the answer proved right, so nobody can fill this from outside
export function spendChallenge(challenge: string, now = Date.now()): boolean {
    for(const [old, end] of used) if(end <= now) used.delete(old)
    if(used.has(challenge)) return false
    used.set(challenge, now + CHALLENGE_LASTS)
    return true
}
