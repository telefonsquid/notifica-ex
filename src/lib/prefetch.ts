import type { User } from '#lib/schemas/users.ts';
import { hasPermission } from '#lib/user.ts';
import { getAdministration } from '../routes/api/administration.remote';
import { getLabels } from '../routes/api/labels.remote';
import { getNotes } from '../routes/api/notes.remote';
import { getReminders } from '../routes/api/reminders.remote';
import { getPeople, getUsers } from '../routes/api/users.remote';
import { getViews } from '../routes/api/views.remote';

/*
    The queries each page awaits before it can show. The root layout fetches them before the view transition
    freezes the screen, the page then finds them cached. Keep in step with the awaits in the pages.
*/

const ROUTE_QUERIES: Record<string, (user: User | undefined) => Promise<unknown>[]> = {
    '/(app)/[[view]]': () => [getNotes(), getLabels(), getReminders(), getViews(), getPeople()],
    '/(app)/settings': (user) => [getLabels(), getViews(), ...(hasPermission(user, 'admin') ? [getUsers(), getAdministration()] : [])]
}

// The returned queries stay cached only while someone holds them, so keep the list until the page shows
export function prefetchRoute(id: string | null | undefined, user: User | undefined){
    return id ? ROUTE_QUERIES[id]?.(user) ?? [] : []
}
