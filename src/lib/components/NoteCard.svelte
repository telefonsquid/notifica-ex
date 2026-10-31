<script lang="ts">
    import ReminderList from '#lib/components/ReminderList.svelte';
    import type { Label, Note, Reminder } from '#lib/schemas.ts';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Pin } from '@lucide/svelte';

    // PROPS
    let {
        note,
        labels,
        reminders,
        onopen,
        ontoggle,
        ondone
    }: {
        note: Note
        labels: Map<string, Label>
        reminders: Reminder[]
        onopen: (origin: { x: number, y: number }) => void      // top center of the card, the editor grows from there
        ontoggle: (task: number) => void                        // ticks a checklist entry right on the card, counted in reading order
        ondone: (reminder: Reminder) => void                    // ticks off an open task reminder
    } = $props()

    let tabs = $derived(note.labels.map((id) => labels.get(id)).filter((label) => !!label))

    function toggleTask(event: MouseEvent){
        const box = event.target
        if(!(box instanceof HTMLInputElement) || !box.classList.contains('task')) return
        const tasks = [...(event.currentTarget as HTMLElement).querySelectorAll('input.task')]
        ontoggle(tasks.indexOf(box))
    }

    function openFrom(target: HTMLElement){
        const box = target.getBoundingClientRect()
        onopen({ x: box.left + box.width / 2, y: box.top })
    }
</script>

<!-- The whole card opens the editor, only the checkboxes and the done button sit above that button -->
<article class="card note-surface motion-interactive relative flex flex-col gap-3 rounded-card border border-line p-card text-ink hover:border-line-strong" data-note={note.color || undefined}>
    <button class="absolute inset-0 rounded-card" aria-label={`Open ${note.title || 'note'}`} onclick={(event) => openFrom(event.currentTarget)}></button>

    <!-- LABELS | folder tabs on the top or bottom edge, they only show their name while the card is hovered -->
    {#if tabs.length}
        <ul class="tabs pointer-events-none absolute flex gap-1 overflow-hidden" aria-label="Labels">
            {#each tabs as label (label.id)}
                <li class="tab note-mark type-meta min-w-6 truncate px-2.5" data-note={label.color || undefined}>
                    <span class="name">{label.name}</span>
                </li>
            {/each}
        </ul>
    {/if}

    <!-- TITLE -->
    {#if note.title || note.pinned}
        <header class="pointer-events-none flex items-start justify-between gap-3">
            <h3 class="type-title text-lg leading-snug break-words">{note.title}</h3>
            {#if note.pinned}<Pin class="mt-1 size-4 shrink-0 text-accent" aria-label="Pinned" />{/if}
        </header>
    {/if}

    <!-- CONTENT | only the checkboxes take clicks, the rest falls through to the card button -->
    {#if note.body}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="content pointer-events-none" onclick={toggleTask}>
            <Markdown source={note.body} class="line-clamp-[12] text-ink-muted" />
        </div>
    {/if}

    <!-- REMINDERS -->
    <ReminderList {reminders} ensureNote={async () => note.id} {ondone} />
</article>

<style>
    /* Raised above the card button, which comes first */
    .content :global(input.task) {
        pointer-events: auto;
        position: relative;
    }

    .card:has(> button:first-child:active) {
        scale: 0.985;
    }

    /* TABS | inset by the corner radius so they sit on the straight part of the edge */
    .tabs {
        bottom: 100%;
        left: var(--layout-radius-card);
        max-width: calc(100% - 2 * var(--layout-radius-card));
        align-items: end;
    }

    .tab {
        height: 0.3125rem;
        border-radius: 0.375rem 0.375rem 0 0;
        line-height: 1.25rem;
        transition: height var(--duration-base) var(--ease-spring);
    }

    /* Bottom edge as picked in the settings, the tabs then grow downwards */
    :global([data-labels='bottom']) .tabs {
        top: 100%;
        bottom: auto;
        align-items: start;
    }

    :global([data-labels='bottom']) .tab {
        border-radius: 0 0 0.375rem 0.375rem;
    }

    .name {
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-out);
    }

    .card:hover .tab,
    .card:focus-within .tab {
        height: 1.25rem;
    }

    .card:hover .name,
    .card:focus-within .name {
        opacity: 1;
        transition-delay: calc(var(--duration-fast) * 0.5);
    }
</style>
