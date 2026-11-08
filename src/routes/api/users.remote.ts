import { idSchema } from '#lib/schemas/base.ts';
import type { Person } from '#lib/schemas/notes.ts';
import { changePasswordSchema, setPasswordSchema, startNoteLockSchema, userEditSchema, userInputSchema, userStateSchema, type User, type UserSummary } from '#lib/schemas/users.ts';
import { endStreams } from '#lib/server/app_stream.ts';
import { confirmPasswordReset, login, passwordMatches, renewStreamKey, requestPasswordReset, userOfToken } from '#lib/server/accounts.ts';
import { removeFor } from '#lib/server/note_access.ts';
import { deleteOne, findOne, getAll, getOne, insertOnePartial, run, updateOnePartial } from '#lib/server/queries.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
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

    const taken = orNull(await findOne('users', 'email = {:email} && id != {:id}', undefined, { email: changes.email, id: me.id }), 'Could not update your account.')
    if(taken) error(400, 'Another account already uses this address.')

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
    if(state === 'inactive') endStreams(id)

    await getUsers().refresh()
    return summary(user)

});

// DELETE | everything the account owns cascades with it, notes of others only lose them from sharing
export const deleteUser = command(idSchema, async (id) => {

    const me = signedIn('admin')
    if(id === me.id) error(400, 'You cannot delete yourself.')

    const user = unwrap(await getOne('users', id), 'User not found.')
    const admins = unwrap(await getAll('users', { filter: 'authorizationLevel = "admin" && state = "active"', fields: 'id' }), 'Could not check the admins.')
    if(user.authorizationLevel === 'admin' && admins.every((admin) => admin.id === id)) error(400, 'You cannot delete the last admin.')

    // Leave notes of others first, the way a collaborator would
    const shared = unwrap(await run((pb) => pb.collection('notes').getFullList({ filter: pb.filter('shared.id ?= {:id}', { id }), fields: 'id' })), 'Could not load the notes shared with them.')
    for(const note of shared) unwrap(await removeFor(note.id, id), 'Could not take them off a shared note.')

    unwrap(await deleteOne('users', id), 'Could not delete the user.')
    endStreams(id)

    await getUsers().refresh()
    await getPeople().refresh()
    return true

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

    // Phones that held the old password's key have to log in again | the token is proven by now
    const user = userOfToken(token)!
    unwrap(await renewStreamKey(user), 'The password changed, but phones stay connected. Try again later.')
    endStreams(user)

    // Locked notes stay sealed under the old key, nobody can open them now
    unwrap(await updateOnePartial('users', user, { noteLock: null }), 'The password changed, but locked notes could not be closed.')

    return true

});

// Signed in again with the new password, so this browser keeps its session | locked notes keep their key, the browser locked it anew
export const changePassword = command(changePasswordSchema, async ({ oldPassword, password, noteLock }) => {

    const me = signedIn()
    if(!await passwordMatches(me.email, oldPassword)) error(400, 'The current password is wrong.')
    if(me.noteLock?.id !== noteLock?.id) error(409, 'Locked notes changed meanwhile, reload the page and try again.')

    unwrap(await updateOnePartial('users', me.id, { password, passwordConfirm: password, noteLock }), 'Could not change the password.')
    unwrap(await login(me.email, password), 'The password changed, log in again with the new one.')

    // Phones that held the old password's key have to log in again
    unwrap(await renewStreamKey(me.id), 'The password changed, but phones stay connected. Try again later.')
    endStreams(me.id)

    return true

});



// NOTE LOCK ============================================================
// The browser made the key, the password proves it is the account's own
export const startNoteLock = command(startNoteLockSchema, async ({ password, noteLock }) => {

    const me = signedIn()
    if(me.noteLock) error(409, 'Locked notes are set up already, reload the page.')
    if(!await passwordMatches(me.email, password)) error(400, 'Wrong password.')

    unwrap(await updateOnePartial('users', me.id, { noteLock }), 'Could not set up locked notes.')
    return true

});
