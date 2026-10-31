import { getRequestEvent } from '$app/server';
import { unwrap } from '#lib/pocketbase.ts';
import { idSchema } from '#lib/schema_limits.ts';
import { setPasswordSchema, userEditSchema, userInputSchema, userStateSchema, type User, type UserSummary } from '#lib/schemas.ts';
import { confirmPasswordReset, getAll, getOne, insertOnePartial, requestPasswordReset, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { hasPermission, restrictAccess } from '#lib/user.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

function summary({ id, name, email, authorizationLevel, state }: User): UserSummary {
    return { id, name, email, authorizationLevel, state }
}

// USERS ============================================================
export const getUsers = query(async () => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'admin')
    const users = unwrap(await getAll('users', { sort: 'name' }), 'Could not load users.')
    return users.map(summary)

});

// INVITE | random password nobody knows, the mail lets the person set their own
export const inviteUser = command(userInputSchema, async (input) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'admin')

    const password = crypto.randomUUID()
    const user = unwrap(await insertOnePartial('users', {
        ...input,
        password,
        passwordConfirm: password,
        state: 'active',
        verified: true,
        emailVisibility: false
    }), 'Could not create the user.')

    unwrap(await requestPasswordReset(user.email), 'The user was created, but the invite mail could not be sent.')

    await getUsers().refresh()
    return summary(user)

});

export const updateUser = command(userEditSchema, async ({ id, ...changes }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'admin')

    // Keep at least the acting admin in charge
    if(id === locals.user.id && changes.authorizationLevel !== locals.user.authorizationLevel){
        error(400, 'You cannot change your own role.')
    }

    const user = unwrap(await updateOnePartial('users', id, changes), 'Could not update the user.')

    await getUsers().refresh()
    return summary(user)

});

// DEACTIVATE | a new token key ends every running session, the request hook rejects the rest
export const setUserState = command(z.object({ id: idSchema, state: userStateSchema }), async ({ id, state }) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'admin')
    if(id === locals.user.id) error(400, 'You cannot deactivate yourself.')

    const changes = state === 'inactive' ? { state, 'tokenKey:autogenerate': '' } : { state }
    const user = unwrap(await updateOnePartial('users', id, changes), 'Could not change the user.')

    await getUsers().refresh()
    return summary(user)

});



// PASSWORDS ============================================================
// Admins send it to anyone, everyone else only to themselves
export const sendPasswordLink = command(idSchema, async (id) => {

    const { locals } = getRequestEvent()
    restrictAccess(locals.user, 'user')
    if(id !== locals.user.id && !hasPermission(locals.user, 'admin')) error(403, 'You can only reset your own password.')

    const user = unwrap(await getOne('users', id), 'User not found.')
    if(user.state === 'inactive') error(400, 'This account is deactivated.')
    unwrap(await requestPasswordReset(user.email), 'Could not send the mail.')
    return true

});

// Open to visitors, the token in the link is the proof
export const setPassword = command(setPasswordSchema, async ({ token, password, passwordConfirm }) => {

    unwrap(await confirmPasswordReset(token, password, passwordConfirm), 'This link has expired or was already used.')
    return true

});
