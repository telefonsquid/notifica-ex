<script lang="ts">
    import ReminderEditor from '#lib/components/ReminderEditor.svelte';
    import { cssEasing, duration, morph, rise, sink, unfold } from '#lib/motion.ts';
    import type { Reminder } from '#lib/schemas.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import { BellPlus, History } from '@lucide/svelte';

    // PROPS
    let {
        reminders,
        ensureNote,
        editable = false,
        focus,
        ondone,
        onhistory
    }: {
        reminders: Reminder[]
        ensureNote: () => Promise<string | null>
        editable?: boolean                          // an open card edits them and can add more
        focus?: string                              // reminder id to start open, 'new' starts the add form
        ondone: (reminder: Reminder) => void
        onhistory: (anchor: HTMLElement) => void
    } = $props()

    // ADDING | a full row while there are none, then a button on the first line opens the form below
    let adding = $derived(editable && focus === 'new')
    let added = $state(0)
    let arriving = $state(false)     // a saved first reminder is on its way, the empty row waits for it

    $effect(() => {
        void reminders.length
        arriving = false
    })

    // Changes animate only once the card finished growing, before that its glide takes care of them
    // Derived, so a closing card drops it before any transition starts
    let ready = $state(false)
    let settled = $derived(editable && ready)
    let shrinking = $state(false)       // the card closes, the band shrinks along with its glide

    $effect(() => {
        if(!editable){
            if(ready) shrinking = true
            ready = false
        }
        const timer = setTimeout(() => editable ? ready = true : shrinking = false, duration('slow'))
        return () => clearTimeout(timer)
    })

    function timing(){
        if(settled) return { duration: duration('base'), easing: cssEasing('in-out') }
        if(shrinking) return { duration: duration('slow'), easing: cssEasing('emphasized') }
        return null
    }

    // TRANSITIONS | the band and its add button drift in with the other open only controls
    function appear(node: Element){
        return settled ? rise(node, { y: 0, scale: 0.6, duration: 'fast' }) : rise(node, { y: 4, scale: 1, blur: 2, duration: 'base', delay: 120 })
    }

    // A closing card folds the button away with its own shrinking
    function leave(node: Element){
        return settled ? sink(node, { y: 0, scale: 0.6 }) : {}
    }

    function finish(saved: boolean){
        adding = false
        added++
        if(saved && !reminders.length) arriving = true
    }
</script>

{#snippet addButton()}
    {#if !adding}
        <button class="icon-button shrink-0" aria-label="Reminder history" onclick={(event) => onhistory(event.currentTarget)} in:appear|global out:leave|global {@attach tip('History')}>
            <History class="size-4" />
        </button>
        <button class="add-reminder icon-button -mr-2 shrink-0" aria-label="Add reminder" onclick={() => adding = true} in:appear|global out:leave|global {@attach tip('Add reminder')}>
            <BellPlus class="size-4" />
        </button>
    {/if}
{/snippet}

<!-- BAND | a darker strip across the bottom of the card, the shade follows the note color | its height morphs around every swap inside -->
{#if reminders.length || editable}
    <footer class={['band -mx-card mt-auto -mb-card flex flex-col px-card py-1 text-ink-muted', !editable && 'pointer-events-none', !reminders.length && 'empty']} in:appear out:unfold {@attach morph(timing)}>
        <div class="flex shrink-0 flex-col">
            {#each reminders as reminder, index (reminder.id)}
                <ReminderEditor
                    {reminder}
                    {ensureNote}
                    {editable}
                    animate={settled}
                    open={focus === reminder.id}
                    trailing={editable && index === 0 ? addButton : undefined}
                    ondone={() => ondone(reminder)}
                    {onhistory}
                />
            {/each}
            {#if editable && (adding || (!reminders.length && !arriving))}
                {#key added}
                    <ReminderEditor {ensureNote} editable animate={settled} open={adding} onclose={finish} />
                {/key}
            {/if}
        </div>
    </footer>
{/if}

<style>
    .band {
        border-bottom-left-radius: calc(var(--layout-radius-card) - 1px);
        border-bottom-right-radius: calc(var(--layout-radius-card) - 1px);
        background-color: var(--theme-note-shade);
    }
</style>
