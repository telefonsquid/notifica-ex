import { getRequestEvent } from '$app/server';
import type { AuthorizationLevel, User } from '#lib/schemas.ts';
import { restrictAccess } from '#lib/user.ts';

// The user behind this request, anyone else gets a 403 | call before the first await
export function signedIn(level: AuthorizationLevel = 'user'): User {
    const { user } = getRequestEvent().locals
    restrictAccess(user, level)
    return user
}
