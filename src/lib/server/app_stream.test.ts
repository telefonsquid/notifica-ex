import { describe, expect, test } from 'bun:test';
import { broadcast, endStreams, streamFor } from '#lib/server/app_stream.ts';
import type { Push } from '#lib/server/push.ts';

const USER = 'stream-test'
const push = { title: 'a push' } as unknown as Push
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Everything a phone would read until the stream ends
async function lines(stream: ReadableStream<Uint8Array>) {
    return (await new Response(stream).text()).split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

describe('the phone stream', () => {
    test('sends the cursor, then what was missed', async () => {
        const stream = streamFor(USER, 'cursor', async () => [push])
        const reading = lines(stream)
        await sleep(5)
        endStreams(USER)
        expect(await reading).toEqual([{ cursor: 'cursor' }, push])
    })

    test('a catch up that fails ends the stream', async () => {
        const stream = streamFor(USER, 'cursor', async () => { throw new Error('database gone') })
        expect(await lines(stream)).toEqual([{ cursor: 'cursor' }])
        expect(broadcast(USER, push)).toBe(0)
    })

    test('a hang up during the catch up does not throw', async () => {
        let answer = (pushes: Push[]) => { void pushes }
        const stream = streamFor(USER, 'cursor', () => new Promise((resolve) => { answer = resolve }))
        const reading = lines(stream)
        await sleep(5)

        endStreams(USER)
        answer([push])
        expect(await reading).toEqual([{ cursor: 'cursor' }])
    })

    test('a phone that left hears nothing more', async () => {
        const reader = streamFor(USER, 'cursor', async () => []).getReader()
        await reader.read()
        await reader.cancel()

        expect(broadcast(USER, push)).toBe(0)
    })
})
