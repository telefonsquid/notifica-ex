<script lang="ts">
    import { NOTE_BACKGROUNDS, formatMoment, isOpenTask } from '#lib/notes.ts';
    import { describeRule } from '#lib/reminders.ts';
    import type { Label, Note, Reminder } from '#lib/schemas.ts';
    import Markdown from '#lib/ui/Markdown.svelte';
    import { Bell, Check, Pin, Square, SquareCheck } from '@lucide/svelte';

    // PROPS
    let {
        note,
        labels,
        reminder,
        onopen,
        ontoggle,
        ondone
    }: {
        note: Note
        labels: Map<string, Label>
        reminder?: Reminder
        onopen: () => void
        ontoggle: (itemId: string) => void      // checks a list item off right on the card
        ondone: () => void                      // ticks off an open task reminder
    } = $props()

    // Long lists end in a count instead of growing the card forever
    const SHOWN_ITEMS = 8

    let items = $derived(note.items ?? [])
    let open = $derived(items.filter((item) => !item.done))
    let done = $derived(items.filter((item) => item.done))
    let shown = $derived([...open, ...done].slice(0, SHOWN_ITEMS))
</script>

<!-- The whole card opens the editor, only the checkboxes sit above that button -->
<article class={['card motion-interactive relative flex flex-col gap-3 rounded-card border border-line p-card text-ink hover:border-line-strong', NOTE_BACKGROUNDS[note.color]]}>
    <button class="absolute inset-0 rounded-card" aria-label={`Open ${note.title || 'note'}`} onclick={onopen}></button>

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

    <!-- FOOTER -->
    {#if reminder || note.labels.length}
        <footer class="pointer-events-none flex flex-wrap items-center gap-1.5">
            {#if reminder}
                {@const due = isOpenTask(reminder)}
                <span class={['type-meta flex items-center gap-1.5 rounded-full px-2.5 py-1', due ? 'bg-accent-soft text-accent' : 'bg-secondary-soft text-secondary']}>
                    <Bell class="size-3" />
                    {describeRule(reminder)}{reminder.next ? ` · ${formatMoment(reminder.next, reminder.timezone)}` : ''}
                </span>
                {#if due}
                    <button class="type-meta motion-interactive pointer-events-auto relative flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-on-accent hover:brightness-110" onclick={ondone}>
                        <Check class="size-3" /> Done
                    </button>
                {/if}
            {/if}
            {#each note.labels as id (id)}
                {@const label = labels.get(id)}
                {#if label}
                    <span class="type-meta rounded-full bg-line px-2.5 py-1 text-ink-muted">{label.name}</span>
                {/if}
            {/each}
        </footer>
    {/if}
</article>

<style>
    .card:has(> button:first-child:active) {
        scale: 0.985;
    }
</style>
