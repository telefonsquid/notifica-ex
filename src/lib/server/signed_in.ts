import { getRequestEvent } from '$app/server';
import type { AuthorizationLevel, User } from '#lib/schemas/users.ts';
import { hasPermission } from '#lib/user.ts';
import { error } from '@sveltejs/kit';

// The user behind this request, anyone else gets a 403 | call before the first await
export function signedIn(level: AuthorizationLevel = 'user'): User {
    const { user } = getRequestEvent().locals
    if(!user || !hasPermission(user, level)) error(403, `Access denied: User does not have the required authorization level of ${level}`)
    return user
}
