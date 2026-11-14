<script lang="ts">
    import FilterEditor from '#lib/components/FilterEditor.svelte';
    import SortEditor from '#lib/components/SortEditor.svelte';
    import { debounced } from '#lib/debounced.ts';
    import { deleteSavedView } from '#lib/deletions.ts';
    import { optimisticOrder } from '#lib/optimistic_order.svelte.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { duration, easing } from '#lib/motion.ts';
    import { LIMITS } from '#lib/schema_limits.ts';
    import type { Label } from '#lib/schemas/notes.ts';
    import type { ViewFilter, ViewIcon, ViewSort } from '#lib/schemas/views.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Button from '#lib/ui/Button.svelte';
    import InlineInput from '#lib/ui/InlineInput.svelte';
    import { VIEW_ICONS, viewIcon } from '#lib/view_icons.ts';
    import { countActive, defaultSort, emptyFilter } from '#lib/views.ts';
    import { ChevronDown, ChevronUp, Plus, Search, SlidersHorizontal, Trash2, X } from '@lucide/svelte';
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

    let saved = $derived(await getViews())

    const order = optimisticOrder(() => saved, reorderViews)
    let views = $derived(order.items)

    // ROW STATE | one open icon picker at a time
    let picking = $state<string | null>(null)

    // ICON SEARCH | the full lucide list loads on first use
    const RESULTS = 60
    let query = $state('')
    let names = $state<string[] | null>(null)

    async function loadNames(){
        if(!names) names = (await import('#lib/lucide_icons.ts')).LUCIDE_NAMES
    }

    // Every word must appear, names starting with the first word come first
    let found = $derived.by(() => {
        const words = query.toLowerCase().trim().split(/[\s-]+/).filter(Boolean)
        if(!words.length || !names) return []
        return names
            .filter((name) => words.every((word) => name.includes(word)))
            .toSorted((a, b) => Number(!a.startsWith(words[0])) - Number(!b.startsWith(words[0])) || a.length - b.length)
    })

    // ====================================================================================================

    function pickIcon(id: string, icon: ViewIcon){
        picking = null
        safeAction(updateView({ id, icon }))
    }

    // FILTERS | saved shortly after the last change, typing in a word field would send every key otherwise
    let pending = $state.raw<Record<string, { filter: ViewFilter, sort: ViewSort }>>({})

    const saving = debounced(async () => {
        const sent = pending
        await Promise.all(Object.entries(sent).map(([id, edit]) => safeAction(updateView({ id, ...edit }))))
        pending = Object.fromEntries(Object.entries(pending).filter(([id, edit]) => sent[id] !== edit))
    })

    function change(id: string, filter: ViewFilter, sort: ViewSort){
        pending = { ...pending, [id]: { filter, sort } }
        saving.schedule()
    }

    $effect(() => saving.flush)

    // ====================================================================================================

    // NEW VIEW | starts empty and opened, so its filters can be set right away
    let creating = $state(false)

    export async function add(){
        creating = true
        const taken = new Set(views.map((view) => view.name.toLowerCase()))
        let number = views.length + 1
        while(taken.has(`view ${number}`)) number++

        const created = await safeAction(createView({ name: `View ${number}`, icon: 'star', filter: emptyFilter(), sort: defaultSort() }))
        if(created) expanded = created.id
        creating = false
    }
</script>

<ul class="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line">
    {#each views as view, index (view.id)}
        {@const Icon = viewIcon(view.icon)}
        {@const active = countActive(pending[view.id]?.filter ?? view.filter)}
        <li class="bg-card" animate:flip={{ duration: duration('base'), easing: easing('in-out') }}>
            <div class="flex items-center gap-2 py-2 pr-2 pl-3">

                <!-- ICON -->
                <Popover.Root bind:open={() => picking === view.id, (open) => { picking = open ? view.id : null; query = '' }}>
                    <Popover.Trigger class="icon-button grid size-10 shrink-0 place-items-center rounded-control" aria-label={`Icon of ${view.name}`} {@attach tip('Icon in the rail')}>
                        <Icon class="size-5" strokeWidth={1.75} />
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Content sideOffset={8} collisionPadding={12} class="popover z-[60] flex w-[18rem] flex-col gap-3 rounded-card border border-line-strong bg-raised p-3 text-ink shadow-2xl" aria-label="Icons">
                            <!-- The curated icons, or what the search found -->
                            <div class="grid max-h-[14.5rem] grid-cols-6 gap-1 overflow-y-auto">
                                {#each query.trim() ? found.slice(0, RESULTS) : VIEW_ICONS as name (name)}
                                    {@const Choice = viewIcon(name)}
                                    <button
                                        class={['icon-button grid size-10 place-items-center rounded-control', view.icon === name && 'bg-accent text-on-accent hover:text-on-accent']}
                                        aria-label={name.replaceAll('-', ' ')}
                                        aria-pressed={view.icon === name}
                                        onclick={() => pickIcon(view.id, name)}
                                    >
                                        <Choice class="size-5" strokeWidth={1.75} />
                                    </button>
                                {:else}
                                    <p class="type-meta col-span-6 py-3 text-center text-ink-faint">{names ? 'No icon by that name' : 'Loading icons'}</p>
                                {/each}
                            </div>
                            {#if found.length > RESULTS}
                                <p class="type-meta -mt-1 text-center text-ink-faint">{found.length - RESULTS} more, narrow the search</p>
                            {/if}

                            <!-- SEARCH | any lucide icon -->
                            <label class="search-field">
                                <Search class="size-4 shrink-0 text-ink-faint" />
                                <input bind:value={query} placeholder="Any lucide icon" aria-label="Search all icons" onfocus={loadNames} oninput={loadNames} />
                                {#if query}
                                    <button type="button" class="icon-button rounded-full p-1" aria-label="Clear search" onclick={() => (query = '')}><X class="size-3.5" /></button>
                                {/if}
                            </label>
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

                <!-- NAME -->
                <InlineInput value={view.name} label={`Rename ${view.name}`} maxlength={LIMITS.VIEW_NAME} class="flex-1 py-1.5 text-ink" onsave={(name) => safeAction(updateView({ id: view.id, name }))} />
                {#if index === 0}<span class="type-meta hidden text-ink-faint sm:inline">Home</span>{/if}

                <!-- ORDER -->
                <button class="icon-button" aria-label={`Move ${view.name} up`} disabled={index === 0} onclick={() => order.move(index, index - 1)} {@attach tip('Move up')}><ChevronUp class="size-4" /></button>
                <button class="icon-button" aria-label={`Move ${view.name} down`} disabled={index === views.length - 1} onclick={() => order.move(index, index + 1)} {@attach tip('Move down')}><ChevronDown class="size-4" /></button>

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

<div class="mt-4 flex justify-center sm:justify-end">
    <Button icon={Plus} loading={creating} onclick={add}>New view</Button>
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
</style>
