import { claimTab, fitted, forgetDraft, oneAtATime, orphanedDrafts, rescued, restoreOf } from '#lib/drafts.ts';
import { kept } from '#lib/note_list.ts';
import { notify } from '#lib/notifications.svelte.ts';
import { safeAction } from '#lib/pocketbase.ts';
import type { Label, Note } from '#lib/schemas.ts';
import { createNote, updateNote } from '../routes/api/notes.remote';

// Hands what pages now gone left behind to the server | a failed one stays for the next load
export async function restoreDrafts(notes: () => Note[], labels: () => Label[], me: string){
    claimTab()

    const restored = await oneAtATime(async () => {
        let count = 0

        for(const { key, draft } of await orphanedDrafts(me)){
            const action = restoreOf(draft, notes())
            if(action === 'drop'){
                forgetDraft(key)
                continue
            }

            const owned = notes().find((note) => note.id === draft.id)?.owner === me
            const known = labels().map((label) => label.id)
            const sent = action === 'update'
                ? kept(updateNote({ id: draft.id!, ...fitted(draft.content, owned ? known : undefined) }))
                : kept(createNote(fitted(rescued(draft.content, draft.content, !draft.id || owned)!, known)))

            if(await safeAction(sent)){
                forgetDraft(key)
                count++
            }
        }
        return count
    })

    if(restored) notify(restored === 1 ? 'Restored an unsaved note.' : `Restored ${restored} unsaved notes.`, { type: 'info' })
}
