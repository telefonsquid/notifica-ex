/*
    State of the one password dialog in the root layout. askPassword() opens it, check() decides
    on each try: null lets it close, a text stays as the error. Where a passkey works too, its check
    does the same.
*/

type PasswordRequest = {
    title: string
    message: string
    action: string
    check: (password: string) => Promise<string | null>
    passkey?: Promise<(() => Promise<string | null>) | null>      // Null when there is none to use
}

export const passwordPrompt = $state({
    open: false,
    request: null as PasswordRequest | null
})

let answer: ((done: boolean) => void) | null = null

export function askPassword(request: PasswordRequest): Promise<boolean> {
    answer?.(false)
    passwordPrompt.request = request
    passwordPrompt.open = true
    return new Promise((resolve) => answer = resolve)
}

// True once a check passed | closing it any other way counts as no
export function settlePassword(done: boolean){
    answer?.(done)
    answer = null
    passwordPrompt.open = false
}
