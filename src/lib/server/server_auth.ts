import { SERVER_AUTH_SECRET, SIGNING_SECRET } from '$app/env/private'
import { isId } from '#lib/schemas/base.ts'
import { error } from '@sveltejs/kit'
import { createHmac } from 'node:crypto'
import { z } from 'zod'

// ONLY LET CALLERS WITH THE SERVER AUTH SECRET THROUGH, I.E. THE MIGRATION CONTAINER
export function restrictToServer(request: Request): void {
    if(!equalsConstantTime(request.headers.get('authorization') ?? '', `Bearer ${SERVER_AUTH_SECRET}`)) {
        error(401, 'Missing or invalid server auth secret.')
    }
}

// SIGNED LINKS | lets a caller without a session act on exactly one thing, i.e. a done button in a notification
export function sign(subject: string): string {
    return createHmac('sha256', SIGNING_SECRET ?? SERVER_AUTH_SECRET).update(subject).digest('hex')
}

export function hasValidSignature(subject: string, signature: string): boolean {
    return equalsConstantTime(signature, sign(subject))
}

const signedSchema = z.object({ signature: z.string().length(64) })

// Reads what a notification button posted | no session, the signature stands in for it
export async function signedAction<T = unknown>(occurrence: string, request: Request, subject: (occurrence: string) => string, fields?: z.ZodType<T>) {
    const body = await request.json().catch(() => null)
    const signed = signedSchema.safeParse(body)
    const extra = fields?.safeParse(body)

    if(!isId(occurrence) || !signed.success || extra?.success === false) error(400, 'Malformed request.')
    if(!hasValidSignature(subject(occurrence), signed.data.signature)) error(403, 'Invalid signature.')
    return extra?.data as T
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
