import { error } from '@sveltejs/kit';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/*
    Pulls a picture off the web for the MCP server and shrinks it to what a note needs. Only
    public hosts, the server must not become a way to reach what sits behind it.
*/

const MAX_DOWNLOAD = 25 * 1024 * 1024       // bytes, phone photos and shop shots are far below
const MAX_REDIRECTS = 3
const TIMEOUT = 20_000                      // ms for the whole download
export const MAX_EDGE = 900                 // px, enough to recognise what a note is about
const QUALITY = 70



// DOWNLOAD ===================================================================================================
export async function fetchRemoteImage(address: string): Promise<File> {
    let url = parseUrl(address)
    const stop = AbortSignal.timeout(TIMEOUT)

    // Redirects are followed by hand so each hop gets checked too
    for(let hop = 0; hop <= MAX_REDIRECTS; hop++){
        await requirePublicHost(url.hostname)

        const response = await fetch(url, { redirect: 'manual', signal: stop, headers: { accept: 'image/*' } }).catch(() => error(502, 'Could not download the image.'))
        const next = response.headers.get('location')
        if(response.status >= 300 && response.status < 400 && next){
            url = parseUrl(new URL(next, url).href)
            continue
        }

        if(!response.ok) error(502, `The image host answered ${response.status}.`)
        return await shrinkImage(await readLimited(response))
    }

    error(502, 'Too many redirects.')
}

function parseUrl(address: string) {
    const url = URL.parse(address)
    if(!url || url.protocol !== 'https:') error(400, 'The image needs an https address.')
    return url
}

// Content-Length can lie or be missing, so the stream is counted
async function readLimited(response: Response): Promise<Uint8Array> {
    const chunks: Uint8Array[] = []
    let size = 0

    for await(const chunk of response.body ?? []){
        size += chunk.length
        if(size > MAX_DOWNLOAD) error(413, 'The image is too large to download.')
        chunks.push(chunk)
    }

    return Buffer.concat(chunks)
}



// PUBLIC HOSTS ===============================================================================================
async function requirePublicHost(host: string) {
    const bare = host.replace(/^\[|\]$/g, '')
    const addresses = isIP(bare) ? [bare] : (await lookup(bare, { all: true }).catch(() => error(502, 'Could not find the image host.'))).map((found) => found.address)
    if(!addresses.length || addresses.some(isPrivate)) error(400, 'The image must come from a public host.')
}

// Loopback, private, link local and the other ranges that never reach the open internet
export function isPrivate(address: string) {
    const lower = address.toLowerCase()

    // An IPv4 address wrapped in IPv6 is judged as the IPv4 one
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    if(mapped) return isPrivate(mapped)

    if(isIP(lower) === 6) return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)

    const [a, b] = lower.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168)
}



// SHRINK =====================================================================================================

// GIFs go up as they are, re-encoding would flatten the animation
async function shrinkImage(bytes: Uint8Array): Promise<File> {
    const original = new Bun.Image(bytes)
    const { format } = await original.metadata().catch(() => error(415, 'That is not an image.'))
    if(format === 'gif') return new File([bytes as Uint8Array<ArrayBuffer>], 'image.gif', { type: 'image/gif' })

    const small = await new Bun.Image(bytes).resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: QUALITY }).bytes()
    return new File([small as Uint8Array<ArrayBuffer>], 'image.webp', { type: 'image/webp' })
}
