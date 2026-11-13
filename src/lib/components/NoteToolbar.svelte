<script lang="ts">
    import { afterNavigate, goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import FilterEditor from '#lib/components/FilterEditor.svelte';
    import SortEditor from '#lib/components/SortEditor.svelte';
    import { unfold } from '#lib/motion.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import type { Label } from '#lib/schemas/notes.ts';
    import type { View, ViewFilter, ViewSort } from '#lib/schemas/views.ts';
    import { noteEditor } from '#lib/note_editor.svelte.ts';
    import { typing } from '#lib/overlays.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import RisoIcon from '#lib/ui/RisoIcon.svelte';
    import { sameFilter } from '#lib/views.ts';
    import { ArrowUpDown, Check, ListFilter, Plus, Search, X } from '@lucide/svelte';
    import { Popover } from 'bits-ui';
    import { tick, untrack } from 'svelte';
    import { createView, updateView } from '../../routes/api/views.remote';

    // PROPS
    let {
        view,
        filter,
        sort,
        labels,
        search = $bindable(''),
        button = $bindable(),
        creating,
        ontweak,
        onsaved,
        oncreate
    }: {
        view?: View
        filter: ViewFilter
        sort: ViewSort
        labels: Label[]
        search?: string
        button?: HTMLElement            // The create button, new notes grow out of it
        creating: boolean               // A new note is open, the create button steps aside
        ontweak: (filter: ViewFilter, sort: ViewSort) => void
        onsaved: () => void
        oncreate: () => void
    } = $props()

    // TWEAKS | what differs from the saved view
    const filterTweaked = $derived(!!view && !sameFilter(filter, view.filter))
    const sortTweaked = $derived(!!view && JSON.stringify(sort) !== JSON.stringify(view.sort))

    let naming = $state(false)
    let newName = $state('')

    afterNavigate(() => naming = false)

    async function saveToView(){
        if(view && await safeAction(updateView({ id: view.id, filter, sort }))) onsaved()
    }

    // Asks for a name right in the popover, then opens the new view
    async function saveAsView(){
        const name = newName.trim()
        if(!name) return
        const created = await safeAction(createView({ name, icon: 'star', filter, sort }))
        if(!created) return
        newName = ''
        await goto(resolve('/(app)/[[view]]', { view: created.id }))
    }

    // SEARCH | an icon until opened, stays open while it holds text, a selection bar in between keeps the text
    let searchInput = $state<HTMLInputElement>()
    let searchOpen = $state(untrack(() => !!search))

    async function openSearch(){
        searchOpen = true
        await tick()
        searchInput?.focus({ preventScroll: true }) // Scrolling into view would slide the field under the icon while it is still narrow
    }

    function closeSearch(){
        search = ''
        searchOpen = false
    }

    // Slash jumps to the search like on most sites
    function focusSearch(event: KeyboardEvent){
        if(event.key !== '/' || typing(event)) return
        event.preventDefault()
        openSearch()
    }
</script>

<svelte:window onkeydown={focusSearch} />

<div class="flex min-w-0 items-center gap-1 rounded-full border border-line bg-raised p-0 shadow-xl">
    <div class={['search motion-interactive flex h-12 items-center rounded-full text-ink-muted', searchOpen && 'open']}>
        <button class="grid size-12 shrink-0 place-items-center rounded-full hover:text-ink" aria-label="Search notes" aria-expanded={searchOpen} onclick={() => searchOpen ? searchInput?.focus() : openSearch()} {@attach tip('Search')}>
            <Search class="size-5" />
        </button>
        {#if searchOpen}
            <input
                bind:this={searchInput}
                bind:value={search}
                placeholder="Search"
                aria-label="Search notes"
                class="min-w-0 flex-1 bg-transparent pr-2 pl-1 text-ink outline-none placeholder:text-ink-faint"
                onblur={() => { if(!search) searchOpen = false }}
                onkeydown={(event) => { if(event.key === 'Escape'){ event.preventDefault(); closeSearch() } }}
            />
            <button class="icon-button mr-1.5 rounded-full p-1.5" aria-label="Close search" onclick={closeSearch}><X class="size-4" /></button>
        {/if}
    </div>

    <!-- SORT AND FILTER | tweak the open view, saving writes them into it -->
    <Popover.Root>
        {@render trigger('Sort', ArrowUpDown, sortTweaked)}
        <Popover.Portal>
            <Popover.Content side="top" sideOffset={12} collisionPadding={12} class="popover z-40 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl">
                <SortEditor {sort} onchange={(changed) => ontweak(filter, changed)} />
                {@render viewActions()}
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>

    <Popover.Root>
        {@render trigger('Filter', ListFilter, filterTweaked)}
        <Popover.Portal>
            <Popover.Content side="top" sideOffset={12} collisionPadding={12} class="popover z-40 flex max-h-[min(44rem,var(--bits-popover-content-available-height))] w-[min(30rem,calc(100vw-1.5rem))] flex-col text-ink">
                <FilterEditor {filter} {labels} onchange={(changed) => ontweak(changed, sort)} footer={viewActions} class="overflow-hidden rounded-card border border-line-strong bg-raised shadow-2xl" />
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
</div>

<!-- CREATE | grows into a blank note at the front of the grid, gone while that one is open -->
<button bind:this={button} class={['create riso-print riso-print-ink grid size-16 shrink-0 place-items-center rounded-full', creating && 'away']} aria-label="New note" tabindex={creating ? -1 : 0} onpointerenter={noteEditor.load} onfocus={noteEditor.load} onclick={oncreate} {@attach tip('New note')}>
    <RisoIcon icon={Plus} class="plus size-7" strokeWidth={2.25} />
</button>

{#snippet trigger(name: string, Icon: typeof Search, tweaked: boolean)}
    <Popover.Trigger class={['motion-interactive relative grid size-12 shrink-0 place-items-center rounded-full hover:text-ink', tweaked ? 'text-accent' : 'text-ink-muted']} aria-label={name} {@attach tip(tweaked ? `${name}, changed from the view` : name)}>
        <Icon class="size-5" />
        {#if tweaked}<span class="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"></span>{/if}
    </Popover.Trigger>
{/snippet}

<!-- VIEW ACTIONS | shared by the sort and filter popovers, a shaded band once something differs from the view -->
{#snippet viewActions()}
    {#if filterTweaked || sortTweaked}
        <footer class="flex flex-wrap items-center gap-2 border-t border-line bg-line/50 px-5 py-3" transition:unfold>
            {#if naming}
                <form class="flex min-w-0 flex-1 gap-2" onsubmit={(event) => { event.preventDefault(); saveAsView() }}>
                    <!-- svelte-ignore a11y_autofocus -->
                    <input bind:value={newName} autofocus placeholder="Name of the new view" aria-label="Name of the new view" class="min-w-0 flex-1 rounded-control border border-line bg-raised px-3 py-1.5 outline-none focus:border-accent" />
                    <button class="action primary" disabled={!newName.trim()}><Check class="size-3.5" />Create</button>
                    <button type="button" class="action" aria-label="Cancel" onclick={() => naming = false}><X class="size-3.5" /></button>
                </form>
            {:else}
                <button class="action" onclick={() => naming = true}>Save as new view</button>
                <button class="action primary ml-auto" onclick={saveToView}><Check class="size-3.5" />Save to {view?.name}</button>
            {/if}
        </footer>
    {/if}
{/snippet}

<style>
    .search {
        width: 3rem;
        overflow: clip;
        transition: width var(--duration-slow) var(--ease-emphasized);
    }

    .search.open {
        width: min(22rem, calc(100vw - 2 * var(--layout-content-gutter) - var(--menu-room) - 8.5rem));
    }

    /* The field and its close button fade in while the pill slides open */
    .search > :not(:first-child) {
        animation: fade-in var(--duration-base) var(--ease-out) var(--duration-fast) both;
    }

    @keyframes fade-in {
        from { opacity: 0; }
    }

    /* CREATE | printed like the buttons, keyboard focus drifts the pass like a hover */
    .create {
        transition:
            scale var(--duration-base) var(--ease-spring),
            opacity var(--duration-base) var(--ease-out),
            width var(--duration-slow) var(--ease-emphasized),
            margin var(--duration-slow) var(--ease-emphasized);
    }

    .create:focus-visible::before {
        translate: 3px 2.25px;
    }

    .create:focus-visible::after {
        translate: -3px -2.25px;
    }

    /* Gives up its room too, the gap included, so search and filter glide to the centre */
    .create.away {
        width: 0;
        margin-left: -0.75rem;
        opacity: 0;
        scale: 0.6;
        pointer-events: none;
    }

    .create :global(.plus) {
        transition: rotate var(--duration-slow) var(--ease-spring);
    }

    .create:hover :global(.plus) {
        rotate: 90deg;
    }

    /* VIEW ACTIONS */
    .action {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.75rem;
        border-radius: 999px;
        color: var(--theme-ink-muted);
        font-size: 0.875rem;
        white-space: nowrap;
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
    }

    .action:hover { background: var(--theme-line); color: var(--theme-ink); }
    .action:disabled { opacity: 0.5; pointer-events: none; }

    .action.primary { background: var(--theme-accent); color: var(--theme-on-accent); }
    .action.primary:hover { background: color-mix(in oklab, var(--theme-accent) 88%, white); }
</style>
