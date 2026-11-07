/*
    Notes on their way out wait here for their Undo toast to end, only then the server hears of them.
*/

export type RemovedNote = { id: string, owner: string }
type Removal = { notes: RemovedNote[], me: string, toast: number }

type Parts = {
    hidden: Set<string>                                                             // What the page leaves out meanwhile
    toast: (notes: RemovedNote[], me: string, undo: () => void, end: () => void) => number
    dismiss: (toast: number) => void
    remove: (note: RemovedNote, me: string) => Promise<unknown>                     // Empty when the server refused, the note comes back
    drop: (notes: RemovedNote[]) => void                                            // Out of the page's list
    send: (notes: RemovedNote[]) => void                                            // The one request that outlives a closing page
}

export function removalQueue({ hidden, toast, dismiss, remove, drop, send }: Parts) {
    const waiting = new Set<Removal>()
    let sent: Removal[] = []

    const show = (notes: RemovedNote[]) => {
        for(const note of notes) hidden.delete(note.id)
    }

    async function finish(removal: Removal){
        if(!waiting.delete(removal)) return
        const { notes, me } = removal

        const results = await Promise.all(notes.map((note) => remove(note, me)))
        drop(notes.filter((_, index) => results[index]))
        show(notes)
    }

    return {
        add(notes: RemovedNote[], me: string){
            for(const note of notes) hidden.add(note.id)

            const removal: Removal = { notes, me, toast: 0 }
            waiting.add(removal)
            removal.toast = toast(notes, me, () => {
                waiting.delete(removal)
                show(notes)
            }, () => finish(removal))
        },

        // The time for second thoughts ends right now
        async finishAll(){
            const removals = [...waiting]
            const done = removals.map(finish)
            for(const removal of removals) dismiss(removal.toast)
            await Promise.all(done)
        },

        // A closing page can't wait for answers
        leave(){
            if(!waiting.size) return
            sent = [...waiting]
            waiting.clear()
            send(sent.flatMap((removal) => removal.notes))
        },

        // The same page again out of the browser's cache, what it sent is out of reach for an Undo
        back(){
            for(const removal of sent){
                dismiss(removal.toast)
                drop(removal.notes)
                show(removal.notes)
            }
            sent = []
        },
    }
}
