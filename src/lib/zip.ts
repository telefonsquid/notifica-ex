/*
    Reads zip files in the browser, enough for a Google Takeout export: stored and deflated
    entries, zip64 for big archives. Only the directory is read up front, each entry unpacks
    when asked for.
*/

export type ZipEntry = { path: string, size: number, read: () => Promise<Blob> }

const END = 0x06054b50
const END64 = 0x06064b50
const END64_LOCATOR = 0x07064b50
const DIRECTORY = 0x02014b50
const LOCAL = 0x04034b50
const FULL = 0xffffffff     // Marks a field whose real value sits in the zip64 extra

// READING ====================================================================================================
export async function readZip(file: Blob): Promise<ZipEntry[]> {
    const { end, endAt } = await findEnd(file)
    let count = end.getUint16(10, true)
    let size = end.getUint32(12, true)
    let offset = end.getUint32(16, true)

    // Zip64 keeps the real numbers in a record of its own, the locator sits right before the end record
    if(offset === FULL || size === FULL || count === 0xffff){
        const locator = await view(file, endAt - 20, 20)
        if(locator.getUint32(0, true) === END64_LOCATOR){
            const end64 = await view(file, Number(locator.getBigUint64(8, true)), 56)
            if(end64.getUint32(0, true) !== END64) throw new Error('Damaged zip file.')
            count = Number(end64.getBigUint64(32, true))
            size = Number(end64.getBigUint64(40, true))
            offset = Number(end64.getBigUint64(48, true))
        }
    }

    const directory = await view(file, offset, size)
    const names = new TextDecoder()
    const entries: ZipEntry[] = []
    let at = 0
    for(let i = 0; i < count; i++){
        if(directory.getUint32(at, true) !== DIRECTORY) throw new Error('Damaged zip file.')
        const method = directory.getUint16(at + 10, true)
        const nameLength = directory.getUint16(at + 28, true)
        const extraLength = directory.getUint16(at + 30, true)
        const commentLength = directory.getUint16(at + 32, true)
        const path = names.decode(new Uint8Array(directory.buffer, directory.byteOffset + at + 46, nameLength))
        const sizes = zip64Sizes(directory, at + 46 + nameLength, extraLength, {
            size: directory.getUint32(at + 24, true),
            packed: directory.getUint32(at + 20, true),
            local: directory.getUint32(at + 42, true)
        })
        at += 46 + nameLength + extraLength + commentLength

        if(path.endsWith('/')) continue
        entries.push({ path, size: sizes.size, read: () => unpack(file, sizes.local, sizes.packed, method) })
    }
    return entries
}



// PARTS ======================================================================================================

// The end record closes the file, followed only by a comment of up to 64 KB
async function findEnd(file: Blob) {
    const start = Math.max(0, file.size - 22 - 0xffff)
    const tail = await view(file, start, file.size - start)
    for(let at = tail.byteLength - 22; at >= 0; at--){
        if(tail.getUint32(at, true) === END) return { end: new DataView(tail.buffer, tail.byteOffset + at, 22), endAt: start + at }
    }
    throw new Error('Not a zip file.')
}

// Only the fields marked full are in the extra, in this order
function zip64Sizes(directory: DataView, at: number, length: number, sizes: { size: number, packed: number, local: number }) {
    const end = at + length
    while(at + 4 <= end){
        const id = directory.getUint16(at, true)
        const fieldLength = directory.getUint16(at + 2, true)
        if(id === 0x0001){
            let field = at + 4
            for(const key of ['size', 'packed', 'local'] as const){
                if(sizes[key] !== FULL) continue
                sizes[key] = Number(directory.getBigUint64(field, true))
                field += 8
            }
            break
        }
        at += 4 + fieldLength
    }
    return sizes
}

// The local header repeats name and extra, often with other lengths than the directory
async function unpack(file: Blob, local: number, packed: number, method: number): Promise<Blob> {
    const header = await view(file, local, 30)
    if(header.getUint32(0, true) !== LOCAL) throw new Error('Damaged zip file.')
    const start = local + 30 + header.getUint16(26, true) + header.getUint16(28, true)
    const data = file.slice(start, start + packed)

    if(method === 0) return data
    if(method === 8) return await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
    throw new Error('This zip file uses a compression the browser can not read.')
}

async function view(file: Blob, start: number, length: number) {
    return new DataView(await file.slice(start, start + length).arrayBuffer())
}
