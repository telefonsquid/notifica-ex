import type { AuthorizationLevel, User } from '#lib/schemas.ts';
import { error } from '@sveltejs/kit';

export function hasPermission(user: User | undefined, requiredAuth: AuthorizationLevel): boolean {
    if(!user) return false;
    if(requiredAuth === 'admin' && user.authorizationLevel === 'admin') return true;
    if(requiredAuth === 'user' && (user.authorizationLevel === 'user' || user.authorizationLevel === 'admin')) return true;
    return false;
}

export function restrictAccess(user: User | undefined, requiredAuth: AuthorizationLevel): asserts user is User {
    if(!hasPermission(user, requiredAuth)){
        error(403, `Access denied: User does not have the required authorization level of ${requiredAuth}`);
    }
}
