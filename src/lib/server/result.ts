import { error } from '@sveltejs/kit';

// What a query came back with | status is the database's own answer, it tells a missing record from a failure
export type Result<T> =
    | { success: true; data: T; error: null }
    | { success: false; data: null; error: string; status?: number };

export const OK: Result<true> = { success: true, data: true, error: null }

export function failure(message: string, status?: number): Result<never> {
    return { success: false, data: null, error: message, status }
}

// The data of a successful result | a missing record stays a 404, the browser reads it as gone
export function unwrap<T>(result: Result<T>, fallbackMessage?: string): NonNullable<T> {
    if(!result.success || !result.data){
        console.error(result)
        error(statusOf(result), {
            message: fallbackMessage ?? result.error ?? 'Unknown Error',
            ...(result.error ? { details: result.error } : {})
        });
    }
    return result.data as NonNullable<T>;
}

// For records that may rightly not exist | every other failure still raises
export function orNull<T>(result: Result<T>, fallbackMessage?: string): T | null {
    if(result.success) return result.data
    if(result.status === 404) return null
    return unwrap(result, fallbackMessage)
}

function statusOf(result: Result<unknown>) {
    const status = (!result.success && result.status) || 400
    return status === 404 ? 404 : status >= 500 ? 500 : 400
}
