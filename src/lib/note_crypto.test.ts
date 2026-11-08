import { describe, expect, test } from 'bun:test';
import { createLock, keyOf, openLock, relock, seal, unseal } from '#lib/note_crypto.ts';
import { sealedSchema } from '#lib/schemas/notes.ts';
import { noteLockSchema } from '#lib/schemas/users.ts';

// The lowest count the schema takes, keeps the tests quick
const ITERATIONS = 100_000

describe('account lock', () => {
    test('opens with the right password only', async () => {
        const { lock } = await createLock('correct horse', ITERATIONS)
        expect(await openLock(lock, 'correct horse')).not.toBeNull()
        expect(await openLock(lock, 'wrong horse')).toBeNull()
    })

    test('fits the schema the server checks', async () => {
        const { lock } = await createLock('correct horse', ITERATIONS)
        expect(noteLockSchema.safeParse(lock).success).toBe(true)
    })

    test('a new password keeps the key, sealed notes stay readable', async () => {
        const { lock, key } = await createLock('old password', ITERATIONS)
        const sealed = await seal(key, lock.id, 'secret')

        const next = await relock(lock, 'old password', 'new password')
        expect(next?.id).toBe(lock.id)
        expect(await openLock(next!, 'old password')).toBeNull()
        expect(await unseal((await openLock(next!, 'new password'))!, sealed)).toBe('secret')
    })

    test('relock refuses a wrong old password', async () => {
        const { lock } = await createLock('old password', ITERATIONS)
        expect(await relock(lock, 'guess', 'new password')).toBeNull()
    })

    test('a lock moved to another id stops opening', async () => {
        const { lock } = await createLock('correct horse', ITERATIONS)
        const other = await createLock('correct horse', ITERATIONS)
        expect(await openLock({ ...lock, id: other.lock.id }, 'correct horse')).toBeNull()
    })
})

describe('sealed bodies', () => {
    test('round trip keeps the text, markdown and emoji included', async () => {
        const { lock, key } = await createLock('pw', ITERATIONS)
        const body = '# Plans\n- [ ] buy milk\n- [x] 🎉 done'
        const sealed = await seal(key, lock.id, body)

        expect(sealedSchema.safeParse(sealed).success).toBe(true)
        expect(keyOf(sealed)).toBe(lock.id)
        expect(sealed).not.toContain('milk')
        expect(await unseal(key, sealed)).toBe(body)
    })

    test('every seal looks different', async () => {
        const { lock, key } = await createLock('pw', ITERATIONS)
        expect(await seal(key, lock.id, 'same')).not.toBe(await seal(key, lock.id, 'same'))
    })

    test('tampered text or another key gives nothing', async () => {
        const { lock, key } = await createLock('pw', ITERATIONS)
        const other = await createLock('pw', ITERATIONS)
        const sealed = await seal(key, lock.id, 'secret')
        const flipped = sealed.slice(0, -2) + (sealed.at(-2) === 'A' ? 'B' : 'A') + sealed.at(-1)

        expect(await unseal(key, flipped)).toBeNull()
        expect(await unseal(other.key, sealed)).toBeNull()
        expect(await unseal(key, sealed.replace(lock.id, other.lock.id))).toBeNull()
        expect(await unseal(key, 'not sealed')).toBeNull()
    })
})
