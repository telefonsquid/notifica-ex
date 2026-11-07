import { claimTab, forgetDraft, oneAtATime, orphanedDrafts, restoreOf } from '#lib/drafts.ts';
import { kept } from '#lib/note_list.ts';
import { notify } from '#lib/notifications.svelte.ts';
import { safeAction } from '#lib/pocketbase.ts';
import type { Note } from '#lib/schemas.ts';
import { createNote, updateNote } from '../routes/api/notes.remote';

// Hands what pages now gone left behind to the server | a failed one stays for the next load
export async function restoreDrafts(notes: () => Note[], me: string){
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
            const sent = action === 'update'
                ? kept(updateNote({ id: draft.id!, ...draft.content }))
                : kept(createNote({ ...draft.content, labels: draft.id && !owned ? [] : draft.content.labels }))

            if(await safeAction(sent)){
                forgetDraft(key)
                count++
            }
        }
        return count
    })

    if(restored) notify(restored === 1 ? 'Restored an unsaved note.' : `Restored ${restored} unsaved notes.`, { type: 'info' })
}
