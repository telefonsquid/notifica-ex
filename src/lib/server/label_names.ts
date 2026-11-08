import { randomLabelColor } from '#lib/note_colors.ts';
import { labelNameSchema, type Label } from '#lib/schemas/notes.ts';
import { getAllOwned, insertOnePartial } from '#lib/server/queries.ts';
import { unwrap } from '#lib/server/result.ts';

// LOOKUP =====================================================================================================
export async function labelsOf(owner: string) {
    return unwrap(await getAllOwned('labels', owner, { sort: 'name' }), 'Could not load labels.')
}

// By id, else by name in any case
export function findLabel(labels: Label[], wanted: string) {
    return labels.find((label) => label.id === wanted) ?? labels.find((label) => label.name.toLowerCase() === wanted.toLowerCase())
}

// Names or ids to ids of the owner's labels, unknown names become new labels unless told otherwise | pass labels to reuse them across calls, new ones get added
export async function labelIds(owner: string, wanted: string[], create = true, labels?: Label[]) {
    const known = labels ?? await labelsOf(owner)
    const ids = new Set<string>()
    for(const name of wanted){
        const found = findLabel(known, name)
        if(found){ ids.add(found.id); continue }
        if(!create) continue

        const label = unwrap(await insertOnePartial('labels', { name: labelNameSchema.parse(name), color: randomLabelColor(), owner }), `Could not create the label ${name}.`)
        known.push(label)
        ids.add(label.id)
    }
    return [...ids]
}
