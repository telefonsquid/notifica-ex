// IMPORTS
import { command as kitCommand, getRequestEvent, query as kitQuery } from '$app/server'
import type { RequestEvent } from '@sveltejs/kit'

// Everything needed to log why a remote function rejected its argument lives in this file.
// SvelteKit hands handleValidationError the issues but never the argument they point at, and zod drops the
// rejected value from a finished issue unless the parse asks for it, which SvelteKit's parse does not.
// Both are in reach inside the schema, so the schema of every remote function gets wrapped here.



// TYPES
type IssuePathSegment = PropertyKey | { readonly key: PropertyKey }
type StandardIssue = { readonly message?: string, readonly path?: readonly IssuePathSegment[] }
type StandardResult = { readonly issues?: readonly StandardIssue[] }
type StandardValidator = { '~standard': { validate: (value: unknown) => StandardResult | Promise<StandardResult> } }



// LOGGING
function reportFailure(event: RequestEvent | undefined, input: unknown, issues: readonly StandardIssue[]): void {

    console.error(`Validation failed on: ${event?.url.pathname ?? 'unknown'}${remoteFunctionName(event)}`)

    for(const issue of issues){
        const path = issuePath(issue)
        console.error(`– ${path.join('.') || 'root'}: ${issue.message ?? 'validation failed'}`)
        console.error(`  received: ${describeValue(valueAtPath(input, path))}`)
    }

}

// EVENT.URL IS REWRITTEN TO THE PAGE THAT MADE THE CALL, ONLY THE RAW REQUEST STILL NAMES THE FUNCTION
function remoteFunctionName(event: RequestEvent | undefined): string {
    if(!event){ return '' }

    const path = new URL(event.request.url).pathname
    if(!path.includes('/remote/')){ return '' }

    return ` (${path.slice(path.lastIndexOf('/') + 1)})`
}

// A PATH ENTRY IS EITHER A PLAIN KEY OR AN OBJECT HOLDING ONE
function issuePath(issue: StandardIssue): PropertyKey[] {
    return (issue.path ?? []).map((segment) => typeof segment === 'object' && segment !== null ? segment.key : segment)
}

function valueAtPath(input: unknown, path: PropertyKey[]): unknown {
    let value = input
    for(const key of path){
        if(value === null || typeof value !== 'object'){ return undefined }
        value = (value as Record<PropertyKey, unknown>)[key]
    }
    return value
}

// A WHOLE RECORD MAY BE AT FAULT, SO CAP WHAT REACHES THE LOG
function describeValue(value: unknown): string {
    if(value === undefined){ return 'undefined' }

    let text: string
    try { text = JSON.stringify(value) ?? String(value) }
    catch { text = String(value) }

    return text.length > 512 ? `${text.slice(0, 512)}… (${text.length} characters)` : text
}



// SCHEMA WRAPPER
// One wrap per schema, the same schema may back several remote functions
const traced = new WeakSet<object>()

function traceFailures<T>(validator: T): T {
    if(validator === null || (typeof validator !== 'object' && typeof validator !== 'function')){ return validator }
    if(traced.has(validator as object)){ return validator }

    const schema = validator as unknown as StandardValidator
    const standard = schema['~standard']
    if(typeof standard?.validate !== 'function'){ return validator }

    schema['~standard'] = {
        ...standard,
        validate: (value: unknown) => {

            // Read the event before validating | without AsyncLocalStorage it is gone after the first await
            let event: RequestEvent | undefined
            try { event = getRequestEvent() } catch { event = undefined }

            const result = standard.validate(value)
            if(result instanceof Promise){
                return result.then((resolved) => {
                    if(resolved?.issues){ reportFailure(event, value, resolved.issues) }
                    return resolved
                })
            }

            if(result?.issues){ reportFailure(event, value, result.issues) }
            return result

        }
    }

    traced.add(validator as object)
    return validator
}



// DROP IN REPLACEMENTS FOR $app/server, IDENTICAL API
export const command = ((...args: unknown[]) => {
    if(args.length > 1){ args[0] = traceFailures(args[0]) }
    return (kitCommand as (...args: unknown[]) => unknown)(...args)
}) as typeof kitCommand

export const query = Object.assign(
    (...args: unknown[]) => {
        if(args.length > 1){ args[0] = traceFailures(args[0]) }
        return (kitQuery as (...args: unknown[]) => unknown)(...args)
    },
    kitQuery
) as unknown as typeof kitQuery
