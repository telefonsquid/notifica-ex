import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CHALLENGE_LASTS, isOpenChallenge, issueChallenge, spendChallenge } from '#lib/server/passkey_challenges.ts';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

const sign = (subject: string) => createHmac('sha256', 'key').update(subject).digest('hex')
const matches = (subject: string, signature: string) => sign(subject) === signature

const issue = (purpose: string, now: number) => Buffer.from(issueChallenge(purpose, sign, now)).toString('base64url')

describe('passkey challenges', () => {
    const NOW = 1_800_000_000_000

    test('open until they run out', () => {
        const challenge = issue('login', NOW)
        expect(isOpenChallenge(challenge, 'login', matches, NOW + CHALLENGE_LASTS - 1)).toBe(true)
        expect(isOpenChallenge(challenge, 'login', matches, NOW + CHALLENGE_LASTS)).toBe(false)
    })

    test('only for what they were made for', () => {
        expect(isOpenChallenge(issue('add:ann', NOW), 'add:bob', matches, NOW)).toBe(false)
        expect(isOpenChallenge(issue('add:ann', NOW), 'login', matches, NOW)).toBe(false)
    })

    test('made up or changed ones are refused', () => {
        const bytes = Buffer.from(issue('login', NOW), 'base64url')
        bytes[20]++ // Part of the end
        expect(isOpenChallenge(bytes.toString('base64url'), 'login', matches, NOW)).toBe(false)
        expect(isOpenChallenge('', 'login', matches, NOW)).toBe(false)
        expect(isOpenChallenge('AAAA', 'login', matches, NOW)).toBe(false)
    })

    test('work once', () => {
        const challenge = issue('login', NOW)
        expect(spendChallenge(challenge, NOW)).toBe(true)
        expect(spendChallenge(challenge, NOW + 1)).toBe(false)
        expect(isOpenChallenge(challenge, 'login', matches, NOW + 1)).toBe(false)
    })
})

// Read as text, accounts.ts needs the SvelteKit env to load
describe('PocketBase session', () => {
    test('the hook serves the route a passkey login asks', () => {
        const route = read('src/lib/server/accounts.ts').match(/PB_SESSION_ROUTE = '([^']+)'/)?.[1]
        expect(route).toBeDefined()
        expect(read('pocketbase/cronjobs/session.pb.js')).toContain(`"${route}/{id}"`)
    })

    test('only the server itself may ask it', () => {
        expect(read('pocketbase/cronjobs/session.pb.js')).toContain('$apis.requireSuperuserAuth()')
    })
})
