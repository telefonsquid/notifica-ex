<script lang="ts">
    import { formatMoment } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { describeRule, parseTimestamp } from '#lib/reminders.ts';
    import type { Reminder, ReminderRepeat } from '#lib/schemas.ts';
    import Button from '#lib/ui/Button.svelte';
    import { Bell, BellOff } from '@lucide/svelte';
    import { untrack } from 'svelte';
    import { removeReminder, setReminder } from '../../routes/api/reminders.remote';

    // PROPS
    let {
        reminder,
        ensureNote
    }: {
        reminder?: Reminder
        ensureNote: () => Promise<string | null>   // saves a new note first, a reminder needs its id
    } = $props()

    const REPEATS: { value: ReminderRepeat, label: string }[] = [
        { value: 'never', label: 'Once' },
        { value: 'hours', label: 'Every n hours' },
        { value: 'days', label: 'Every n days' },
        { value: 'weeks', label: 'Every n weeks' },
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
    async function save(){
        saving = true
        const note = await ensureNote()
        if(note){
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
            await safeAction(setReminder({ note, at: new Date(at).toISOString(), repeat, every, timezone, task }))
        }
        saving = false
    }

    async function remove(){
        if(!reminder) return
        saving = true
        await safeAction(removeReminder(reminder.note))
        saving = false
    }
</script>

<section class="flex flex-col gap-3 rounded-control border border-line p-4">
    <h3 class="type-meta flex items-center gap-2 text-ink-faint">
        <Bell class="size-3.5" /> Reminder
        {#if reminder}
            <span class="text-secondary normal-case tracking-normal">
                {describeRule(reminder)}{reminder.next ? `, next ${formatMoment(reminder.next, reminder.timezone)}` : ', no further times'}
            </span>
        {/if}
    </h3>

    <div class="flex flex-wrap items-center gap-2">
        <input type="datetime-local" bind:value={at} aria-label="First time" class="field" />

        <select bind:value={repeat} aria-label="Repeat" class="field">
            {#each REPEATS as option (option.value)}
                <option value={option.value}>{option.label}</option>
            {/each}
        </select>

        {#if repeat !== 'never'}
            <input type="number" min="1" max="999" bind:value={every} aria-label="Interval" class="field w-20" />
        {/if}
    </div>

    <label class="flex items-center gap-2 text-ink-muted">
        <input type="checkbox" bind:checked={task} class="accent-[var(--theme-accent)]" />
        Task with a done button in the notification
    </label>

    <div class="flex gap-2">
        <Button style="secondary" icon={Bell} loading={saving} onclick={save}>{reminder ? 'Update' : 'Set reminder'}</Button>
        {#if reminder}
            <Button style="ghost" icon={BellOff} disabled={saving} onclick={remove}>Remove</Button>
        {/if}
    </div>
</section>

<style>
    .field {
        height: 2.5rem;
        padding-inline: 0.75rem;
        border: 1px solid var(--theme-line);
        border-radius: var(--layout-radius-control);
        background: var(--theme-raised);
        color: var(--theme-ink);
        transition: border-color var(--duration-fast) var(--ease-out);
    }

    .field:hover {
        border-color: var(--theme-line-strong);
    }

    .field:focus {
        border-color: var(--theme-accent);
        outline: none;
    }
</style>
