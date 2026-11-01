<script lang="ts">
    import FilterEditor from '#lib/components/FilterEditor.svelte';
    import { safeAction } from '#lib/pocketbase.ts';
    import { onCollectionChange } from '#lib/realtime.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import { VIEW_ICONS, type Label, type ViewFilter, type ViewIcon, type ViewSort } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import ConfirmButton from '#lib/ui/ConfirmButton.svelte';
    import InlineInput from '#lib/ui/InlineInput.svelte';
    import { VIEW_ICON_COMPONENTS } from '#lib/view_icons.ts';
    import { countActive, defaultSort, emptyFilter } from '#lib/views.ts';
    import { ChevronDown, ChevronUp, Plus, SlidersHorizontal, Trash2 } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import { flip } from 'svelte/animate';
    import { createView, deleteView, getViews, reorderViews, updateView } from '../../routes/api/views.remote';

    // PROPS
    let { labels }: { labels: Label[] } = $props()

    let views = $derived(await getViews())

    $effect(() => onCollectionChange('views', () => getViews().refresh()))

    // ROW STATE | one open filter editor and one open icon picker at a time
    let expanded = $state<string | null>(null)
    let picking = $state<string | null>(null)

    // ====================================================================================================

    function pickIcon(id: string, icon: ViewIcon){
        picking = null
        safeAction(updateView({ id, icon }))
    }

    // Swaps with the neighbour and sends the whole order
    function move(index: number, step: -1 | 1){
        const ids = views.map((view) => view.id);
        [ids[index], ids[index + step]] = [ids[index + step], ids[index]]
        safeAction(reorderViews(ids))
    }

    // FILTERS | saved shortly after the last change, typing in a word field would send every key otherwise
    let pending = $state<Record<string, { filter: ViewFilter, sort: ViewSort }>>({})
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}

    function change(id: string, filter: ViewFilter, sort: ViewSort){
        const edit = { filter, sort }
        pending[id] = edit
        clearTimeout(timers[id])
        timers[id] = setTimeout(async () => {
            await safeAction(updateView({ id, ...edit }))
            if(pending[id] === edit) delete pending[id]
        }, 400)
    }

    // ====================================================================================================

    // NEW VIEW | starts empty and opened, so its filters can be set right away
    let creating = $state(false)

    async function add(){
        creating = true
        const taken = new Set(views.map((view) => view.name.toLowerCase()))
        let number = views.length + 1
        while(taken.has(`view ${number}`)) number++

        const created = await safeAction(createView({ name: `View ${number}`, icon: 'star', filter: emptyFilter(), sort: defaultSort() }))
        if(created) expanded = created.id
        creating = false
    }
</script>

<ul class="grid gap-px overflow-hidden rounded-card border border-line bg-line">
    {#each views as view, index (view.id)}
        {@const Icon = VIEW_ICON_COMPONENTS[view.icon]}
        {@const active = countActive(pending[view.id]?.filter ?? view.filter)}
        <li class="bg-card" animate:flip={{ duration: 280 }}>
            <div class="flex items-center gap-2 py-2 pr-2 pl-3">

                <!-- ICON -->
                <Popover.Root bind:open={() => picking === view.id, (open) => (picking = open ? view.id : null)}>
                    <Popover.Trigger class="icon-button grid size-10 shrink-0 place-items-center rounded-control" aria-label={`Icon of ${view.name}`} {@attach tip('Icon in the rail')}>
                        <Icon class="size-5" strokeWidth={1.75} />
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Content sideOffset={8} collisionPadding={12} class="popover z-[60] grid grid-cols-6 gap-1 p-3" aria-label="Icons">
                            {#each VIEW_ICONS as name (name)}
                                {@const Choice = VIEW_ICON_COMPONENTS[name]}
                                <button
                                    class={['icon-button grid size-10 place-items-center rounded-control', view.icon === name && 'bg-accent text-on-accent hover:text-on-accent']}
                                    aria-label={name.replace('-', ' ')}
                                    aria-pressed={view.icon === name}
                                    onclick={() => pickIcon(view.id, name)}
                                >
                                    <Choice class="size-5" strokeWidth={1.75} />
                                </button>
                            {/each}
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

                <!-- NAME -->
                <InlineInput value={view.name} label={`Rename ${view.name}`} maxlength={LIMITS.VIEW_NAME} class="flex-1 py-1.5 text-ink" onsave={(name) => safeAction(updateView({ id: view.id, name }))} />
                {#if index === 0}<span class="type-meta hidden text-ink-faint sm:inline">Home</span>{/if}

                <!-- ORDER -->
                <button class="icon-button" aria-label={`Move ${view.name} up`} disabled={index === 0} onclick={() => move(index, -1)} {@attach tip('Move up')}><ChevronUp class="size-4" /></button>
                <button class="icon-button" aria-label={`Move ${view.name} down`} disabled={index === views.length - 1} onclick={() => move(index, 1)} {@attach tip('Move down')}><ChevronDown class="size-4" /></button>

                <!-- FILTERS -->
                <button
                    class={['icon-button relative', expanded === view.id && 'bg-line text-ink']}
                    aria-label={`Filters of ${view.name}`}
                    aria-expanded={expanded === view.id}
                    {@attach tip('Filter and sort')}
                    onclick={() => (expanded = expanded === view.id ? null : view.id)}
                >
                    <SlidersHorizontal class="size-4" />
                    {#if active}<span class="count type-meta">{active}</span>{/if}
                </button>

                <!-- DELETE | the last view stays -->
                <ConfirmButton
                    icon={Trash2}
                    label={`Delete ${view.name}`}
                    confirmLabel={`Confirm deleting ${view.name}`}
                    hint={views.length === 1 ? 'Keep at least one view' : 'Delete view'}
                    confirmHint="Click again to delete"
                    disabled={views.length === 1}
                    onconfirm={() => safeAction(deleteView(view.id))}
                />
            </div>

            {#if expanded === view.id}
                <div class="border-t border-line px-card py-5">
                    <FilterEditor
                        filter={pending[view.id]?.filter ?? view.filter}
                        sort={pending[view.id]?.sort ?? view.sort}
                        {labels}
                        onchange={(filter, sort) => change(view.id, filter, sort)}
                    />
                </div>
            {/if}
        </li>
    {/each}
</ul>

<div class="mt-4">
    <Button style="ghost" icon={Plus} loading={creating} onclick={add}>New view</Button>
</div>

<style>
    .count {
        position: absolute;
        top: -0.25rem;
        right: -0.25rem;
        display: grid;
        place-items: center;
        min-width: 1.125rem;
        height: 1.125rem;
        padding-inline: 0.25rem;
        border-radius: 999px;
        background: var(--theme-accent);
        color: var(--theme-on-accent);
        font-size: 0.6875rem;
        line-height: 1;
    }</style>
