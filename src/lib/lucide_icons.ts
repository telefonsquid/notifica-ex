import type { Bell } from '@lucide/svelte';

/*
    Every lucide icon, each loaded only once something shows it.
    Import this module dynamically, its name list alone is about 2000 entries.
*/

type IconComponent = typeof Bell

const files = import.meta.glob<{ default: IconComponent }>('/node_modules/@lucide/svelte/dist/icons/*.svelte')
const loaders = new Map(Object.entries(files).map(([path, load]) => [path.slice(path.lastIndexOf('/') + 1, -'.svelte'.length), load]))

export const LUCIDE_NAMES = [...loaders.keys()]

export async function importIcon(name: string): Promise<IconComponent | null> {
    const load = loaders.get(name)
    return load ? (await load()).default : null
}
