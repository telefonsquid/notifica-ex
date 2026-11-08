import { parseChangelog } from '#lib/changelog.ts';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('parseChangelog', () => {

    test('reads releases newest first with their changes', () => {
        const text = '# Changelog\r\n\r\n## 0.2.0 · 2026-11-09\r\n\r\n- added a\r\n- fixed b\r\n\r\n## 0.1.0 · 2026-11-08\r\n\r\n- first release\r\n'
        expect(parseChangelog(text)).toEqual([
            { version: '0.2.0', date: '2026-11-09', changes: ['added a', 'fixed b'] },
            { version: '0.1.0', date: '2026-11-08', changes: ['first release'] },
        ])
    })

    test('ignores bullets before the first release', () => {
        expect(parseChangelog('- stray\n## 1.0.0 · 2027-01-01\n')).toEqual([{ version: '1.0.0', date: '2027-01-01', changes: [] }])
    })

    // The About page shows package.json's version, the changelog must not lag behind
    test('the newest release is the version in package.json', () => {
        const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
        const [newest] = parseChangelog(read('CHANGELOG.md'))
        expect(newest.version).toBe(JSON.parse(read('package.json')).version)
        expect(newest.changes.length).toBeGreaterThan(0)
    })

})
