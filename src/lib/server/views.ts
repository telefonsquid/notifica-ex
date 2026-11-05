import { viewFilterSchema, viewSortSchema, type ViewFilter, type ViewSort } from '#lib/schemas.ts';
import { defaultSort, emptyFilter } from '#lib/views.ts';

// Saved filters may predate newer fields, parsing fills them in
export function readFilter(value: unknown): ViewFilter {
    const parsed = viewFilterSchema.safeParse(value ?? {})
    return parsed.success ? parsed.data : emptyFilter()
}

export function readSort(value: unknown): ViewSort {
    const parsed = viewSortSchema.safeParse(value ?? {})
    return parsed.success ? parsed.data : defaultSort()
}
