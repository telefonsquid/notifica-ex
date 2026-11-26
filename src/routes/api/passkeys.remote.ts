import { idSchema } from '#lib/schemas/base.ts';
import { addPasskeySchema, passkeyAnswerSchema, passkeyNoteKeyInputSchema, startPasskeySchema } from '#lib/schemas/passkeys.ts';
import { openSession, passwordMatches } from '#lib/server/accounts.ts';
import { addPasskey as add, creationOptions, listPasskeys, loginOptions, ownerOfAnswer, removePasskey as remove, saveNoteKey } from '#lib/server/passkeys.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { error } from '@sveltejs/kit';

// PASSKEYS ============================================================
export const getPasskeys = query(async () => {

    const me = signedIn()
    return listPasskeys(me.id)

});

// Asks the password first, an open browser must not be enough to get in for good
export const startPasskey = command(startPasskeySchema, async ({ password }) => {

    const me = signedIn()
    if(!await passwordMatches(me.email, password)) error(400, 'Wrong password.')
    return creationOptions(me)

});

export const addPasskey = command(addPasskeySchema, async (input) => {

    const me = signedIn()
    const added = await add(me, input)

    await getPasskeys().refresh()
    return added

});

// Lets a passkey open locked notes
export const setPasskeyNoteKey = command(passkeyNoteKeyInputSchema, async ({ id, noteKey }) => {

    const me = signedIn()
    await saveNoteKey(id, me, noteKey)

    await getPasskeys().refresh()

});

export const removePasskey = command(idSchema, async (id) => {

    const me = signedIn()
    await remove(id, me.id)

    await getPasskeys().refresh()

});



// SIGNING IN ============================================================
// Both open to everyone, nobody is signed in yet
export const startPasskeyLogin = command(async () => loginOptions());

export const finishPasskeyLogin = command(passkeyAnswerSchema, async (answer) => {

    const owner = await ownerOfAnswer(answer)
    return openSession(owner)

});
