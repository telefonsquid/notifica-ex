import { resolve } from '$app/paths';

// RETURN PATH | where the login sends someone after a link, like a notification tap, met an expired session

const PARAM = 'next'

// Both the request url and the read only one of page state fit
type Address = { pathname: string, search: string, searchParams: { get(name: string): string | null } }

// Login link that comes back to the given page afterwards
export function loginPath(url: Address): string {
    const back = url.pathname + url.search
    return back === '/' ? resolve('/login') : `${resolve('/login')}?${PARAM}=${encodeURIComponent(back)}`
}

// Only paths on this site, so a crafted link can't send anyone elsewhere after logging in
export function returnPath(url: Address): string {
    const next = url.searchParams.get(PARAM)
    return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}
