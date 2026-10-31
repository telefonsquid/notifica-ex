import { SERVER_AUTH_SECRET } from '$app/env/private'
import { error } from '@sveltejs/kit'
import { createHmac } from 'node:crypto'

// ONLY LET CALLERS WITH THE SERVER AUTH SECRET THROUGH, I.E. THE MIGRATION CONTAINER
export function restrictToServer(request: Request): void {
    if(!equalsConstantTime(request.headers.get('authorization') ?? '', `Bearer ${SERVER_AUTH_SECRET}`)) {
        error(401, 'Missing or invalid server auth secret.')
    }
}

// SIGNED LINKS | lets a caller without a session act on exactly one thing, i.e. a done button in a notification
export function sign(subject: string): string {
    return createHmac('sha256', SERVER_AUTH_SECRET).update(subject).digest('hex')
}

export function hasValidSignature(subject: string, signature: string): boolean {
    return equalsConstantTime(signature, sign(subject))
}

// COMPARE WITHOUT EXITING EARLY, SO RESPONSE TIMES DON'T LEAK HOW MUCH OF THE SECRET WAS RIGHT
function equalsConstantTime(given: string, expected: string): boolean {
    const encoder = new TextEncoder()
    const a = encoder.encode(given)
    const b = encoder.encode(expected)
    let diff = a.length ^ b.length
    for(let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]
    return diff === 0
}
