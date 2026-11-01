<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { deleteSavedView } from '#lib/deletions.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import type { View } from '#lib/schemas.ts';
    import { ArrowRight, ChevronDown, ChevronUp, Pencil, Trash2 } from '@lucide/svelte';
    import { DropdownMenu as Menu } from 'bits-ui';
    import { reorderViews } from '../../routes/api/views.remote';

    /*
        Items for the right click menu of a view in the rail and in the phone menu. Bits shares the
        item parts between its menus, so this renders inside any of them.
    */

    // PROPS
    let {
        view,
        views,
        current
    }: {
        view: View
        views: View[]                   // all of them in rail order, for moving and the last one that stays
        current: boolean                // the view on screen, deleting it leads to the first one
    } = $props()

    let index = $derived(views.findIndex((item) => item.id === view.id))

    // Settings open this view's filters from the query
    function edit(){
        // eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved, only the query is added
        goto(`${resolve('/(app)/settings')}?view=${view.id}`)
    }

    // Swaps with the neighbour and sends the whole order
    function move(step: -1 | 1){
        const ids = views.map((item) => item.id);
        [ids[index], ids[index + step]] = [ids[index + step], ids[index]]
        safeAction(reorderViews(ids))
    }

    // The menu is gone by the time the answer comes, so the view is held on to first
    async function remove(){
        const leaving = current
        if(await deleteSavedView(view) && leaving) goto(resolve('/(app)/[[view]]', {}))
    }
</script>

<Menu.Item class="menu-item" onSelect={() => goto(resolve('/(app)/[[view]]', { view: index === 0 ? undefined : view.id }))}>
    <ArrowRight class="size-4" />Open
</Menu.Item>
<Menu.Item class="menu-item" onSelect={edit}>
    <Pencil class="size-4" />Edit view
</Menu.Item>

<Menu.Separator class="menu-separator" />
<Menu.Item class="menu-item" disabled={index === 0} onSelect={() => move(-1)}>
    <ChevronUp class="size-4" />Move up
</Menu.Item>
<Menu.Item class="menu-item" disabled={index === views.length - 1} onSelect={() => move(1)}>
    <ChevronDown class="size-4" />Move down
</Menu.Item>

<!-- The last view stays -->
<Menu.Separator class="menu-separator" />
<Menu.Item class="menu-item" disabled={views.length === 1} onSelect={remove}>
    <Trash2 class="size-4" />Delete view
</Menu.Item>
