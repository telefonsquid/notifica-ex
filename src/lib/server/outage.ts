import { error } from '@sveltejs/kit';

// PocketBase did not answer at all or its proxy gave up | a cancelled request is no outage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isOutage(err: any): boolean {
    return !err?.isAbort && [0, 502, 503, 504].includes(err?.status)
}

export function outage(): never {
    error(503, 'The server is down.')
}
