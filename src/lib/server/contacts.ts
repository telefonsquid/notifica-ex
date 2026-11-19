import { LIMITS } from '#lib/schema_limits.ts';
import type { InviteSummary } from '#lib/schemas/contacts.ts';
import type { Person } from '#lib/schemas/notes.ts';
import type { User } from '#lib/schemas/users.ts';
import { deleteOne, findOne, getAll, getAllOwned, getOne, getOwned, insertOnePartial, run } from '#lib/server/queries.ts';
import { orNull, unwrap } from '#lib/server/result.ts';
import { hasPermission } from '#lib/user.ts';
import { error } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';

/*
    Who someone may share notes with. Admins see every account, everyone else only their
    contacts and the people they already share notes with. Contacts come from invite links:
    one use, a week long, only a hash is stored.
*/

const INVITE_DAYS = 7

// Links carry 192 random bits, a plain hash is enough to keep them safe at rest
function hashOf(token: string) {
    return createHash('sha256').update(token).digest('hex')
}

function personOf({ id, name, email }: Pick<User, 'id' | 'name' | 'email'>): Person {
    return { id, name: name || email.split('@')[0] }
}



// INVITES ====================================================================================================

// Expired links are cleared on the way, nothing else looks at them
export async function listInvites(owner: string): Promise<InviteSummary[]> {
    const invites = unwrap(await getAllOwned('invites', owner, { sort: '-created', fields: 'id,expires,created' }), 'Could not load the invite links.')
    const now = new Date()

    const [open, stale] = [invites.filter((invite) => new Date(invite.expires) > now), invites.filter((invite) => new Date(invite.expires) <= now)]
    await Promise.all(stale.map((invite) => deleteOne('invites', invite.id)))
    return open
}

// The token comes back only here, once
export async function createInvite(owner: string) {
    if((await listInvites(owner)).length >= LIMITS.INVITES) error(400, `At most ${LIMITS.INVITES} invite links can be open at once.`)

    const token = randomBytes(24).toString('base64url')
    const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const stored = unwrap(await insertOnePartial('invites', { owner, hash: hashOf(token), expires }), 'Could not create the invite link.')

    return { token, summary: { id: stored.id, expires: stored.expires, created: stored.created } satisfies InviteSummary }
}

export async function revokeInvite(id: string, owner: string) {
    unwrap(await getOwned('invites', id, owner), 'Invite link not found.')
    unwrap(await deleteOne('invites', id), 'Could not revoke the invite link.')
}

// Wrong, used, expired or revoked links and a deactivated inviter all look alike
async function openInvite(token: string) {
    const invite = orNull(await findOne('invites', 'hash = {:hash}', undefined, { hash: hashOf(token) }), 'Could not check the invite link.')
    if(!invite || new Date(invite.expires) <= new Date()) return null

    const inviter = orNull(await getOne('users', invite.owner), 'Could not check the invite link.')
    if(!inviter || inviter.state !== 'active') return null

    return { invite, inviter }
}

// What the invite page shows before anyone accepts
export async function inviteFor(token: string, me: User) {
    const found = await openInvite(token)
    if(!found) return { state: 'invalid' as const }
    if(found.inviter.id === me.id) return { state: 'own' as const }

    const known = (await contactIds(me.id)).has(found.inviter.id)
    return { state: known ? 'known' as const : 'open' as const, inviter: personOf(found.inviter) }
}

// Connects both sides and uses the link up
export async function redeemInvite(token: string, me: User) {
    const found = await openInvite(token)
    if(!found) error(410, 'This invite link is no longer valid.')
    if(found.inviter.id === me.id) error(400, 'This is your own invite link.')

    await connect(found.inviter.id, me.id)
    unwrap(await deleteOne('invites', found.invite.id), 'Could not use up the invite link.')
    return personOf(found.inviter)
}



// CONTACTS ===================================================================================================

async function contactIds(owner: string) {
    const rows = unwrap(await getAllOwned('contacts', owner, { fields: 'person' }), 'Could not load your contacts.')
    return new Set(rows.map((row) => row.person))
}

// One row each way, a row already there stays
async function connect(a: string, b: string) {
    const [knownByA, knownByB] = await Promise.all([contactIds(a), contactIds(b)])
    if(!knownByA.has(b)) unwrap(await insertOnePartial('contacts', { owner: a, person: b }), 'Could not add the contact.')
    if(!knownByB.has(a)) unwrap(await insertOnePartial('contacts', { owner: b, person: a }), 'Could not add the contact.')
}

export async function listContacts(owner: string): Promise<Person[]> {
    const ids = await contactIds(owner)
    return (await activePeople()).filter((person) => ids.has(person.id))
}

// Both sides lose each other | notes already shared stay shared
export async function removeContact(owner: string, person: string) {
    const rows = unwrap(await run((pb) => {
        const filter = pb.filter('(owner = {:owner} && person = {:person}) || (owner = {:person} && person = {:owner})', { owner, person })
        return pb.collection('contacts').getFullList({ filter, fields: 'id' })
    }), 'Could not remove the contact.')

    for(const row of rows) unwrap(await deleteOne('contacts', row.id), 'Could not remove the contact.')
}



// PEOPLE =====================================================================================================

async function activePeople() {
    const users = unwrap(await getAll('users', { filter: 'state = "active"', sort: 'name', fields: 'id,name,email' }), 'Could not load people.')
    return users.map(personOf)
}

// Everyone this user may share with or sees on a note, themself included for the faces
export async function peopleFor(user: User): Promise<Person[]> {
    const everyone = await activePeople()
    if(hasPermission(user, 'admin')) return everyone

    const notes = unwrap(await run((pb) => {
        const filter = pb.filter('owner = {:me} || shared.id ?= {:me} || (linkMode != "" && linked.id ?= {:me})', { me: user.id })
        return pb.collection('notes').getFullList<{ owner: string, shared: string[], linked: string[] }>({ filter, fields: 'owner,shared,linked' })
    }), 'Could not load people.')

    const known = await contactIds(user.id)
    known.add(user.id)
    for(const note of notes) for(const id of [note.owner, ...note.shared]) known.add(id)

    // Strangers holding the same link stay unknown, only the owner and their own joiners get a name
    const linked = new Set<string>()
    for(const note of notes){
        const people = note.owner === user.id ? note.linked : note.linked.includes(user.id) ? [note.owner] : []
        for(const id of people) if(!known.has(id)) linked.add(id)
    }

    return everyone.filter((person) => known.has(person.id) || linked.has(person.id)).map((person) => linked.has(person.id) ? { ...person, viaLink: true } : person)
}
