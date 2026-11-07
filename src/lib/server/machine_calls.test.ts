import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

// A POST with no content type and no origin counts as a cross site form, a built app answers 403 and the dev server never shows it
describe('calls from outside the browser name a content type', () => {
    test('every PocketBase cron job', () => {
        const calls = read('pocketbase/cronjobs/cron.pb.js').split('$http.send(').slice(1).map((call) => call.split('})')[0])
        expect(calls.length).toBeGreaterThan(0)
        for(const call of calls) expect(call).toContain('"Content-Type"')
    })

    test('the setup call in the compose file', () => {
        const migration = read('docker-compose-example.yml').split('migration:')[1]
        expect(migration).toContain('Content-Type: application/json')
    })
})
