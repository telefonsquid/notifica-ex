import { LIMITS } from '#lib/schema_limits.ts';
import { idSchema } from '#lib/schemas/base.ts';
import { createInvite, listContacts, listInvites, redeemInvite, removeContact, revokeInvite } from '#lib/server/contacts.ts';
import { command, query } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';
import { z } from 'zod';
import { getPeople } from './users.remote';

const tokenSchema = z.string().min(1).max(LIMITS.INVITE_TOKEN)

// CONTACTS ============================================================
export const getContacts = query(async () => {

    const me = signedIn()
    return listContacts(me.id)

});

// Notes already shared with them stay shared
export const deleteContact = command(idSchema, async (person) => {

    const me = signedIn()
    await removeContact(me.id, person)

    await Promise.all([getContacts().refresh(), getPeople().refresh()])

});



// INVITES ============================================================
export const getInvites = query(async () => {

    const me = signedIn()
    return listInvites(me.id)

});

// The token comes back only here, once
export const createInviteLink = command(async () => {

    const me = signedIn()
    const created = await createInvite(me.id)

    await getInvites().refresh()
    return created

});

export const revokeInviteLink = command(idSchema, async (id) => {

    const me = signedIn()
    await revokeInvite(id, me.id)

    await getInvites().refresh()

});

export const acceptInvite = command(tokenSchema, async (token) => {

    const me = signedIn()
    const inviter = await redeemInvite(token, me)

    await Promise.all([getContacts().refresh(), getPeople().refresh()])
    return inviter

});
