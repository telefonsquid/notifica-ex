<script lang="ts">
    import { formatMoment, isOpenTask } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { describeRule, parseTimestamp } from '#lib/reminders.ts';
    import type { Reminder, ReminderRepeat } from '#lib/schemas.ts';
    import { Bell, BellPlus, Check, ListChecks, Trash2, X } from '@lucide/svelte';
    import { untrack } from 'svelte';
    import { addReminder, removeReminder, updateReminder } from '../../routes/api/reminders.remote';

    // PROPS
    let {
        reminder,
        ensureNote,
        editable = false,
        open = $bindable(false),
        ondone,
        onclose
    }: {
        reminder?: Reminder                         // missing for a new one, which starts open
        ensureNote: () => Promise<string | null>    // saves a new note first, a reminder needs its id
        editable?: boolean                          // a closed card only shows the line, the click goes to the card
        open?: boolean
        ondone?: () => void                         // ticks off an open task
        onclose?: () => void
    } = $props()

    const REPEATS: { value: ReminderRepeat, label: string }[] = [
        { value: 'never', label: 'Once' },
        { value: 'hours', label: 'Hours' },
        { value: 'days', label: 'Days' },
        { value: 'weeks', label: 'Weeks' },
    ]

    // FORM | starts from the stored rule, or the next full hour for a new one
    const initial = untrack(() => reminder)
    let at = $state(toLocalInput(parseTimestamp(initial?.at) ?? nextFullHour()))
    let repeat = $state<ReminderRepeat>(initial?.repeat ?? 'never')
    let every = $state(initial?.every ?? 1)
    let task = $state(initial?.task ?? false)
    let saving = $state(false)

    // Value format of datetime-local inputs, in the browser's own zone
    function toLocalInput(date: Date): string {
        const pad = (value: number) => String(value).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function nextFullHour(): Date {
        const now = new Date()
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1)
    }

    // ACTIONS
    function close(){
        open = false
        onclose?.()
    }

    async function save(){
        saving = true
        const rule = { at: new Date(at).toISOString(), repeat, every, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, task }
        const note = reminder ? reminder.note : await ensureNote()
        const saved = note && await safeAction(reminder ? updateReminder({ id: reminder.id, ...rule }) : addReminder({ note, ...rule }))
        saving = false
        if(saved) close()
    }

    async function remove(){
        if(!reminder) return close()
        saving = true
        if(await safeAction(removeReminder(reminder.id))) close()
        saving = false
    }
</script>

{#if open}
    <!-- FORM -->
    <form class="flex flex-wrap items-center gap-1.5 py-1" onsubmit={(event) => { event.preventDefault(); save() }}>
        <input type="datetime-local" bind:value={at} aria-label="First time" class="field min-w-0 flex-1 basis-44" />

        <div class="flex items-center gap-1.5">
            {#if repeat !== 'never'}
                <input type="number" min="1" max="999" bind:value={every} aria-label="Every" class="field w-14" />
            {/if}
            <select bind:value={repeat} aria-label="Repeat" class="field">
                {#each REPEATS as option (option.value)}
                    <option value={option.value}>{repeat === 'never' || option.value === 'never' ? option.label : `${option.label} apart`}</option>
                {/each}
            </select>
        </div>

        <div class="ml-auto flex items-center">
            <button type="button" class={['icon-button', task && 'text-accent']} aria-label="Done button in the notification" title="Done button in the notification" aria-pressed={task} onclick={() => task = !task}>
                <ListChecks class="size-4" />
            </button>
            <button type="button" class="icon-button" aria-label={reminder ? 'Remove reminder' : 'Discard'} disabled={saving} onclick={remove}>
                {#if reminder}<Trash2 class="size-4" />{:else}<X class="size-4" />{/if}
            </button>
            <button type="submit" class="icon-button text-accent" aria-label="Save reminder" disabled={saving}>
                <Check class="size-4" />
            </button>
        </div>
    </form>
{:else if reminder}
    <!-- LINE | hatched while a task waits to be checked off -->
    {@const due = isOpenTask(reminder)}
    <div class={['line flex min-h-9 items-center gap-2', due && 'due']}>
        <button class={['type-meta flex min-w-0 flex-1 items-center gap-2 text-left', editable ? 'hover:text-ink' : 'pointer-events-none']} tabindex={editable ? 0 : -1} aria-label={`Edit reminder ${describeRule(reminder)}`} onclick={() => open = true}>
            {#if reminder.task}<ListChecks class="size-3.5 shrink-0" />{:else}<Bell class="size-3.5 shrink-0" />{/if}
            <span class="truncate">{describeRule(reminder)}{reminder.next ? ` · ${formatMoment(reminder.next, reminder.timezone)}` : ''}</span>
        </button>
        {#if due && ondone}
            <button class="type-meta motion-interactive pointer-events-auto relative flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-on-accent hover:brightness-110" onclick={ondone}>
                <Check class="size-3" /> Done
            </button>
        {/if}
    </div>
{:else}
    <button class="type-meta flex min-h-9 items-center gap-2 hover:text-ink" onclick={() => open = true}>
        <BellPlus class="size-3.5" /> Add reminder
    </button>
{/if}

<style>
    .field {
        height: 2.25rem;
        padding-inline: 0.625rem;
        border: 1px solid var(--theme-line);
        border-radius: var(--layout-radius-control);
        background: var(--theme-raised);
        color: var(--theme-ink);
        font-size: 0.875rem;
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .field:hover {
        border-color: var(--theme-line-strong);
    }

    .field:focus {
        border-color: var(--theme-accent);
        outline: none;
    }

    /* Hatch runs across the whole band, not just the text */
    .line.due {
        margin-inline: calc(-1 * var(--layout-card-padding));
        padding-inline: var(--layout-card-padding);
        color: var(--theme-ink);
        background-image: repeating-linear-gradient(-45deg, transparent 0 0.375rem, color-mix(in oklab, var(--theme-accent) 20%, transparent) 0.375rem 0.75rem);
    }
</style>
