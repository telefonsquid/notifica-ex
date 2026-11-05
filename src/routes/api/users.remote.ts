import { idSchema, setPasswordSchema, userEditSchema, userInputSchema, userStateSchema, type Person, type User, type UserSummary } from '#lib/schemas.ts';
import { confirmPasswordReset, findOne, getAll, getOne, insertOnePartial, requestPasswordReset, unwrap, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { hasPermission } from '#lib/user.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

function summary({ id, name, email, authorizationLevel, state }: User): UserSummary {
    return { id, name, email, authorizationLevel, state }
}

// USERS ============================================================
export const getUsers = query(async () => {

    signedIn('admin')
    const users = unwrap(await getAll('users', { sort: 'name' }), 'Could not load users.')
    return users.map(summary)

});

// Everyone a note can be shared with, names only so the others' mail addresses stay private
export const getPeople = query(async (): Promise<Person[]> => {

    signedIn()
    const users = unwrap(await getAll('users', { filter: 'state = "active"', sort: 'name', fields: 'id,name,email' }), 'Could not load people.')
    return users.map(({ id, name, email }) => ({ id, name: name || email.split('@')[0] }))

});

// INVITE | random password nobody knows, the mail lets the person set their own
export const inviteUser = command(userInputSchema, async (input) => {

    signedIn('admin')

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

    const me = signedIn('admin')

    // Keep at least the acting admin in charge
    if(id === me.id && changes.authorizationLevel !== me.authorizationLevel){
        error(400, 'You cannot change your own role.')
    }

    const user = unwrap(await updateOnePartial('users', id, changes), 'Could not update the user.')

    await getUsers().refresh()
    return summary(user)

});

// Everyone changes their own name and mail, the role stays with the admins
export const updateProfile = command(userInputSchema.pick({ name: true, email: true }), async (changes) => {

    const me = signedIn()

    const taken = await findOne('users', 'email = {:email} && id != {:id}', undefined, { email: changes.email, id: me.id })
    if(taken.success) error(400, 'Another account already uses this address.')

    const user = unwrap(await updateOnePartial('users', me.id, changes), 'Could not update your account.')

    await getPeople().refresh()
    return summary(user)

});

// DEACTIVATE | a new token key ends every running session, the request hook rejects the rest
export const setUserState = command(z.object({ id: idSchema, state: userStateSchema }), async ({ id, state }) => {

    const me = signedIn('admin')
    if(id === me.id) error(400, 'You cannot deactivate yourself.')

    const changes = state === 'inactive' ? { state, 'tokenKey:autogenerate': '' } : { state }
    const user = unwrap(await updateOnePartial('users', id, changes), 'Could not change the user.')

    await getUsers().refresh()
    return summary(user)

});



// PASSWORDS ============================================================
// Admins send it to anyone, everyone else only to themselves
export const sendPasswordLink = command(idSchema, async (id) => {

    const me = signedIn()
    if(id !== me.id && !hasPermission(me, 'admin')) error(403, 'You can only reset your own password.')

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
