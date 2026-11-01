/*
    State of the one confirm dialog in the root layout. confirmAction() opens it and resolves
    with the answer, so a destructive action reads as one awaited line.
*/

export type ConfirmRequest = {
    title: string
    message: string
    action: string                      // the confirm button, a verb like Delete
}

export const confirmation = $state({
    open: false,
    request: null as ConfirmRequest | null
})

let answer: ((confirmed: boolean) => void) | null = null

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
    answer?.(false)
    confirmation.request = request
    confirmation.open = true
    return new Promise((resolve) => answer = resolve)
}

// Called by the dialog | closing it any other way counts as no
export function settleConfirmation(confirmed: boolean){
    answer?.(confirmed)
    answer = null
    confirmation.open = false
}
