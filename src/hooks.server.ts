// IMPORTS
import { INTERNAL_POCKETBASE_URL } from '$app/env/private'
import type { User } from '#lib/schemas.ts'
import { DEFAULT_THEME, THEME_COOKIE, isThemeName } from '#lib/themes/index.ts'
import { sequence, type Handle, type HandleServerError } from '@sveltejs/kit/hooks'
import PocketBase, { getTokenPayload } from 'pocketbase'

const authenticate = (async ({ event, resolve }) => {

    // RECREATE POCKETBASE OBJECT ON EVERY REQUEST
    event.locals.pb = new PocketBase(INTERNAL_POCKETBASE_URL) // holds no connection, only what is needed to make requests, so it is cheap

    // LOAD STORED DATA FROM COOKIE IF IT EXISTS
    event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '')

    // REMEMBER LOGIN STATE BEFORE REQUEST RESOLVE
    const wasAuthenticated = event.locals.pb.authStore.isValid

    // VERIFY THE COOKIE WITH POCKETBASE, ITS CONTENT IS CLIENT CONTROLLED AND UNSIGNED
    if(wasAuthenticated){
        try {
            const record = await event.locals.pb.collection('users').getOne(getTokenPayload(event.locals.pb.authStore.token).id)
            if(record.state === 'inactive') throw new Error('Deactivated') // deactivation must end running sessions too
            event.locals.pb.authStore.save(event.locals.pb.authStore.token, record)
        } catch {
            event.locals.pb.authStore.clear()
        }
    }

    // GRAB USER FROM COOKIE AND MAKE IT AVAILABLE AS POJO
    if(event.locals.pb.authStore.isValid){
        const user: User = structuredClone(event.locals.pb.authStore.record) as User // structured clone strips the record class down to plain data
        event.locals.user = user
    } else {
        event.locals.user = undefined
    }

    // WAIT UNTIL REQUEST IS RESOLVED
    const response = await resolve(event)

    // SET COOKIE BECAUSE SOMETHING MIGHT HAVE CHANGED WHEN RESOLVING THE REQUEST (I.E. LOGIN) OR SKIP IT FOR VISITORS WHO NEVER HAD A SESSION
    if(wasAuthenticated || event.locals.pb.authStore.isValid){
        response.headers.append('set-cookie', event.locals.pb.authStore.exportToCookie({ secure: true }))
    }

    // RETURN RESPONSE
    return response

}) satisfies Handle

const applyTheme = (async ({ event, resolve }) => {

    // READ THEME FROM COOKIE, FALL BACK FOR UNKNOWN OR MISSING ONES
    const theme = event.cookies.get(THEME_COOKIE)
    event.locals.theme = isThemeName(theme) ? theme : DEFAULT_THEME

    // RENDER THE THEME INTO THE HTML | set before first paint so the page never flashes the wrong colors
    return resolve(event, {
        transformPageChunk: ({ html }) => html.replace('%theme%', event.locals.theme)
    })

}) satisfies Handle

export const handle = sequence(authenticate, applyTheme)



// ERROR HANDLING ====================================================================================================
export const handleError: HandleServerError = ({ kind, error, issues }) => {

    // UNEXPECTED ERRORS | a custom hook replaces the default logging
    if(kind === 'unknown'){ console.error(error) }

    // ONLY VALIDATION ERRORS GET A CUSTOM MESSAGE | spells out remote function schema mismatches for debugging
    if(kind !== 'validation'){ return }

    // LOG THE RAW ISSUES => THE CALL AND THE REJECTED VALUES ARE ALREADY REPORTED IN #lib/server/remote_function_error_trace
    console.dir(issues, { depth: null });

    let notification = 'ERROR:'
    for(const issue of issues){
        notification = notification + '\n– '
        if(issue.message){
            notification = notification + issue.message
        } else if(issue.path && issue.path.length >= 1){
            notification = notification + issue.path.toString() + ': validation failed'
        } else {
            notification = notification + 'Unknown'
        }
    }

    return {
        message: notification
    };
};
