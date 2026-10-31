<script lang="ts">
    import ReminderList from '#lib/components/ReminderList.svelte';
    import type { Label, Note, Reminder } from '#lib/schemas.ts';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Pin, Square, SquareCheck } from '@lucide/svelte';

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
        ontoggle: (itemId: string) => void                      // checks a list item off right on the card
        ondone: (reminder: Reminder) => void                    // ticks off an open task reminder
    } = $props()

    // Long lists end in a count instead of growing the card forever
    const SHOWN_ITEMS = 8

    let items = $derived(note.items ?? [])
    let open = $derived(items.filter((item) => !item.done))
    let done = $derived(items.filter((item) => item.done))
    let shown = $derived([...open, ...done].slice(0, SHOWN_ITEMS))

    let tabs = $derived(note.labels.map((id) => labels.get(id)).filter((label) => !!label))

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

    <!-- CONTENT -->
    {#if note.kind === 'list'}
        <ul class="flex flex-col gap-1">
            {#each shown as item (item.id)}
                <li class={['flex items-start gap-1', item.done ? 'text-ink-faint line-through' : 'text-ink-muted']}>
                    <button
                        class="motion-interactive relative -m-1 shrink-0 rounded-md p-1 hover:text-ink"
                        aria-label={`${item.done ? 'Uncheck' : 'Check'} ${item.text || 'item'}`}
                        aria-pressed={item.done}
                        onclick={() => ontoggle(item.id)}
                    >
                        {#if item.done}<SquareCheck class="mt-0.5 size-4" />{:else}<Square class="mt-0.5 size-4" />{/if}
                    </button>
                    <span class="pointer-events-none ml-1 break-words">{item.text}</span>
                </li>
            {/each}
        </ul>
        {#if items.length > SHOWN_ITEMS}
            <p class="type-meta pointer-events-none text-ink-faint">+{items.length - SHOWN_ITEMS} more</p>
        {/if}
    {:else if note.kind === 'markdown'}
        <Markdown source={note.body} class="pointer-events-none line-clamp-[12] text-ink-muted" />
    {:else if note.body}
        <p class="pointer-events-none line-clamp-[12] break-words whitespace-pre-line text-ink-muted">{note.body}</p>
    {/if}

    <!-- REMINDERS -->
    <ReminderList {reminders} ensureNote={async () => note.id} {ondone} />
</article>

<style>
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
