import { loginPath } from '#lib/return_path.ts';
import { inviteFor } from '#lib/server/contacts.ts';
import { outage } from '#lib/server/outage.ts';
import { redirect } from '@sveltejs/kit';

// Logged out visitors come back here after the login
export async function load({ locals, params, url }) {
    if(locals.serverDown) outage()
    if(!locals.user) redirect(303, loginPath(url))
    return { invite: await inviteFor(params.token, locals.user) }
}
