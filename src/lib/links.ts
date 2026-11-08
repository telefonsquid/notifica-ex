import { resolve } from '$app/paths';

// Both the request url and the read only one of page state fit
type Address = { searchParams: { get(name: string): string | null } }

// LINKS WITH A QUERY | built and read here, so both ends agree on the name

// Notification taps open the note on the notes page
export const noteLink = (id: string) => `${resolve('/(app)/[[view]]', {})}?note=${encodeURIComponent(id)}`
export const linkedNote = (url: Address) => url.searchParams.get('note')

// The rail's Edit opens that view's filters in settings
export const viewSettingsLink = (id: string) => `${resolve('/(app)/settings')}?view=${encodeURIComponent(id)}`
export const linkedView = (url: Address) => url.searchParams.get('view')

// The rail's New view lands there too and creates one | no record id is that short
export const NEW_VIEW = 'new'
export const newViewLink = () => viewSettingsLink(NEW_VIEW)
