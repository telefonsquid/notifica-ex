import changelog from '../../../CHANGELOG.md?raw';
import pkg from '../../../package.json' with { type: 'json' };
import { parseChangelog } from '#lib/changelog.ts';
import { serverDetails } from '#lib/server/about.ts';
import { query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { hasPermission } from '#lib/user.ts';

// Baked in at build time, the running server shows the release it was built from
const RELEASES = parseChangelog(changelog)

export const getAbout = query(async () => {
    const user = signedIn()

    return {
        version: pkg.version,
        releases: RELEASES,
        server: hasPermission(user, 'admin') ? await serverDetails() : null
    }
});
