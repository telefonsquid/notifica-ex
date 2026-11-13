import { isId } from '#lib/schemas/base.ts';
import { streamSubject } from '#lib/server/app_stream.ts';
import { getOne } from '#lib/server/queries.ts';
import { orNull } from '#lib/server/result.ts';
import { hasValidSignature } from '#lib/server/server_auth.ts';
import { error } from '@sveltejs/kit';

// The account behind a phone's stream key | the share routes take the same key, the app has no session of its own outside the webview
export async function keyHolder(id: string, key: string) {
    if(!isId(id)) error(401, 'Unknown stream.')

    // Only a missing user reads as a bad key, the app gives up on those and retries anything else
    const user = orNull(await getOne('users', id), 'Stream not available.')
    if(!user || user.state === 'inactive' || !hasValidSignature(streamSubject(user), key)) error(401, 'Unknown stream.')
    return user
}
