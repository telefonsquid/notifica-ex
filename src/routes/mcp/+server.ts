import { userForKey } from '#lib/server/api_keys.ts';
import { answer, failure } from '#lib/server/mcp/protocol.ts';
import { json } from '@sveltejs/kit';

// A note body is 20000 characters, the rest of a message is small
const MAX_BODY = 256 * 1024

// One JSON-RPC message per POST, as an API key's owner
export async function POST({ request }) {

    // VERIFY
    const key = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    const caller = key ? await userForKey(key) : null
    if(!caller) return new Response('Missing or invalid API key.', { status: 401, headers: { 'www-authenticate': 'Bearer realm="Notifica Ex"' } })

    // READ
    const text = await request.text()
    if(text.length > MAX_BODY) return json(failure(null, -32600, 'Message too large.'), { status: 413 })

    let message: unknown
    try { message = JSON.parse(text) }
    catch { return json(failure(null, -32700, 'Parse error.'), { status: 400 }) }

    // Batches left the protocol in 2025-06-18
    if(Array.isArray(message)) return json(failure(null, -32600, 'Batches are not supported.'), { status: 400 })

    // ANSWER | notifications and responses only get an acknowledgement
    const reply = await answer(message, caller)
    return reply ? json(reply) : new Response(null, { status: 202 })

}

// No server sent stream and no sessions to end
export function GET() {
    return new Response(null, { status: 405, headers: { allow: 'POST' } })
}

export const DELETE = GET
