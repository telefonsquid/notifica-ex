import type { CheckedImport, ImportResult } from '#lib/schemas/imports.ts';
import { labelIds, labelsOf } from '#lib/server/label_names.ts';
import { getAll, insertOnePartial } from '#lib/server/queries.ts';
import { ruleFields } from '#lib/server/reminder_rules.ts';
import { unwrap } from '#lib/server/result.ts';
import { createHash } from 'node:crypto';

/*
    Notes from another app. Each gets an id derived from its owner and source, so importing
    the same export again finds what is already there and only adds what is new.
*/

// IMPORTING ==================================================================================================
export async function importNotes(owner: string, notes: CheckedImport[]): Promise<ImportResult> {
    const ids = notes.map((note) => importedId(owner, note.source))
    const stored = unwrap(await getAll('notes', { filter: ids.map((id) => `id = '${id}'`).join(' || '), fields: 'id' }), 'Could not read the notes.')
    const existing = new Set(stored.map((note) => note.id))

    const labels = await labelsOf(owner)
    const created: ImportResult['created'] = []
    for(const [index, { source, labels: names, reminders, ...content }] of notes.entries()){
        const id = ids[index]
        if(existing.has(id)) continue

        // Twice in one batch counts once
        existing.add(id)
        const labelled = await labelIds(owner, names, true, labels)
        unwrap(await insertOnePartial('notes', { ...content, id, labels: labelled, owner }), `Could not import ${content.title || 'a note'}.`)

        // Notes already there keep the reminders they have
        for(const rule of reminders) unwrap(await insertOnePartial('reminders', { ...ruleFields(rule), note: id, owner }), `Could not add a reminder to ${content.title || 'a note'}.`)
        created.push({ source, id, reminders: reminders.length })
    }

    return { created, existing: notes.length - created.length }
}

// Fits pocketbase ids, 15 characters of a to z and 0 to 9
export function importedId(owner: string, source: string) {
    const hash = createHash('sha256').update(`${owner}\n${source}`).digest('hex')
    return BigInt(`0x${hash}`).toString(36).slice(-15).padStart(15, '0')
}
