<script lang="ts">
    import FilterEditor from '#lib/components/FilterEditor.svelte';
    import { deleteSavedView } from '#lib/deletions.ts';
    import SortEditor from '#lib/components/SortEditor.svelte';
    import { safeAction } from '#lib/pocketbase.ts';
    import { onCollectionChange } from '#lib/realtime.ts';
    import { VIEW_ICONS, type Label, type ViewFilter, type ViewIcon, type ViewSort } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import { VIEW_ICON_COMPONENTS } from '#lib/view_icons.ts';
    import { countActive, defaultSort, emptyFilter } from '#lib/views.ts';
    import { ChevronDown, ChevronUp, Plus, SlidersHorizontal, Trash2 } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import { flip } from 'svelte/animate';
    import { createView, getViews, reorderViews, updateView } from '../../routes/api/views.remote';

    // PROPS
    let {
        labels,
        expanded = $bindable(null)
    }: {
        labels: Label[]
        expanded?: string | null        // the view whose filters show, the rail menu can open one
    } = $props()

    let views = $derived(await getViews())

    $effect(() => onCollectionChange('views', () => getViews().refresh()))

    // ROW STATE | one open icon picker at a time
    let picking = $state<string | null>(null)

    // ====================================================================================================

    // NAME | an empty or unchanged name puts the old one back
    function rename(id: string, input: HTMLInputElement, current: string){
        const name = input.value.trim()
        if(!name || name === current){
            input.value = current
            return
        }
        safeAction(updateView({ id, name })).then((result) => {
            if(!result) input.value = current
        })
    }

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
                        <Popover.Content sideOffset={8} collisionPadding={12} class="icons z-[60] grid grid-cols-6 gap-1 rounded-card border border-line-strong bg-raised p-3 text-ink shadow-2xl" aria-label="Icons">
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
                <input
                    value={view.name}
                    aria-label={`Rename ${view.name}`}
                    class="min-w-0 flex-1 bg-transparent py-1.5 text-ink outline-none"
                    onchange={(event) => rename(view.id, event.currentTarget, view.name)}
                    onkeydown={(event) => { if(event.key === 'Enter') event.currentTarget.blur() }}
                />
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
                <button
                    class="icon-button"
                    aria-label={`Delete ${view.name}`}
                    {@attach tip(views.length === 1 ? 'Keep at least one view' : 'Delete view')}
                    disabled={views.length === 1}
                    onclick={() => deleteSavedView(view)}
                >
                    <Trash2 class="size-4" />
                </button>
            </div>

            {#if expanded === view.id}
                {@const filter = pending[view.id]?.filter ?? view.filter}
                {@const sort = pending[view.id]?.sort ?? view.sort}
                <div class="grid border-t border-line sm:grid-cols-[16rem_minmax(0,1fr)]">
                    <div class="border-b border-line sm:border-r sm:border-b-0">
                        <SortEditor {sort} onchange={(changed) => change(view.id, filter, changed)} />
                    </div>
                    <div class="pt-3 pr-3">
                        <FilterEditor {filter} {labels} onchange={(changed) => change(view.id, changed, sort)} />
                    </div>
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
    }

    /* Grows out of the icon that opened it */
    :global(.icons[data-state='open']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: icons-in var(--duration-base) var(--ease-spring);
    }

    :global(.icons[data-state='closed']) {
        transform-origin: var(--bits-popover-content-transform-origin);
        animation: icons-in var(--duration-fast) var(--ease-in) reverse forwards;
    }

    @keyframes icons-in {
        from { opacity: 0; scale: 0.94; }
    }
</style>
