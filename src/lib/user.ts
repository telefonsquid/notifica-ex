import type { AuthorizationLevel, User } from '#lib/schemas/users.ts';

export function hasPermission(user: User | undefined, requiredAuth: AuthorizationLevel): boolean {
    if(!user) return false;
    if(requiredAuth === 'admin' && user.authorizationLevel === 'admin') return true;
    if(requiredAuth === 'user' && (user.authorizationLevel === 'user' || user.authorizationLevel === 'admin')) return true;
    return false;
}
