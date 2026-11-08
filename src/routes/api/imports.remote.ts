import { importBatchSchema } from '#lib/schemas/imports.ts';
import { importNotes as importInto } from '#lib/server/imports.ts';
import { getReminders } from './reminders.remote.ts';
import { command } from '#lib/server/remote_function_error_trace.ts';
import { signedIn } from '#lib/server/signed_in.ts';

// IMPORTS ============================================================
// The browser reads the export and sends it in batches, files go up afterwards like any other
export const importNotes = command(importBatchSchema, async (notes) => {

    const me = signedIn()
    const result = await importInto(me.id, notes)

    if(result.created.some((note) => note.reminders)) await getReminders().refresh()
    return result

});
