import { safeAction } from '#lib/safe_action.ts';
import type { Label } from '#lib/schemas/notes.ts';
import type { View } from '#lib/schemas/views.ts';
import { confirmAction } from '#lib/singletons/confirm.svelte.ts';
import { deleteLabel } from '../routes/api/labels.remote';
import { deleteView } from '../routes/api/views.remote';

// Deletes that reach beyond the thing in front of you ask first, the same way from every place that offers them

export async function deleteLabelEverywhere(label: Label){
    const confirmed = await confirmAction({
        title: `Delete ${label.name}?`,
        message: 'The label comes off every note that carries it. The notes themselves stay.',
        action: 'Delete label'
    })
    return confirmed && !!await safeAction(deleteLabel(label.id))
}

export async function deleteSavedView(view: View){
    const confirmed = await confirmAction({
        title: `Delete ${view.name}?`,
        message: 'Only the saved filter and sort go, every note stays where it is.',
        action: 'Delete view'
    })
    return confirmed && !!await safeAction(deleteView(view.id))
}
