import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

// Read as text, about.ts needs the SvelteKit env to load
describe('PocketBase version', () => {

    test('the hook serves the route the About page asks', () => {
        const route = read('src/lib/server/about.ts').match(/PB_VERSION_ROUTE = '([^']+)'/)?.[1]
        expect(route).toBeDefined()
        expect(read('pocketbase/cronjobs/about.pb.js')).toContain(`"${route}"`)
    })

    test('the image hands its version to the hook', () => {
        expect(read('pocketbase/Dockerfile')).toContain('ENV PB_VERSION=')
    })

})
