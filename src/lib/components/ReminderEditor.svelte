<script lang="ts">
    import { now } from '#lib/clock.svelte.ts';
    import { formatDistance, formatMoment, isOpenTask } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { describeRule, parseTimestamp, UNITS, WEEKDAYS } from '#lib/reminders.ts';
    import type { Reminder, ReminderRepeat, Weekday } from '#lib/schemas.ts';
    import { rise, unfold } from '#lib/motion.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import NumberField from '#lib/ui/NumberField.svelte';
    import { Bell, BellPlus, Check, ListChecks, Trash2, X } from '@lucide/svelte';
    import { untrack, type Snippet } from 'svelte';
    import { addReminder, removeReminder, updateReminder } from '../../routes/api/reminders.remote';

    // PROPS
    let {
        reminder,
        ensureNote,
        editable = false,
        animate = false,
        open = $bindable(false),
        ondone,
        onclose,
        trailing
    }: {
        reminder?: Reminder                         // missing for a new one, which starts open
        ensureNote: () => Promise<string | null>    // saves a new note first, a reminder needs its id
        editable?: boolean                          // a closed card only shows the line, the click goes to the card
        animate?: boolean                           // off while the card itself resizes, its glide covers the change then
        open?: boolean
        ondone?: () => void                         // ticks off an open task
        onclose?: (saved: boolean) => void
        trailing?: Snippet                          // extra buttons at the end of the line
    } = $props()

    const REPEATS: ReminderRepeat[] = ['never', 'hours', 'days', 'weeks', 'weekdays', 'months', 'years']

    // FORM | starts from the stored rule, or the next full hour for a new one
    const initial = untrack(() => reminder)
    let at = $state(toLocalInput(parseTimestamp(initial?.at) ?? nextFullHour()))
    let repeat = $state<ReminderRepeat>(initial?.repeat ?? 'never')
    let every = $state(initial?.every ?? 1)
    let weekdays = $state<Weekday[]>([...(initial?.weekdays ?? [])])
    let until = $state(toLocalInput(parseTimestamp(initial?.until)).slice(0, 10))
    let task = $state(initial?.task ?? false)
    let saving = $state(false)

    // Hours to years take a count and read as "every 3 days"
    let counted = $derived(repeat !== 'never' && repeat !== 'weekdays')

    function optionLabel(option: ReminderRepeat): string {
        if(option === 'never') return 'Once'
        if(option === 'weekdays') return 'Weekdays'
        if(!counted) return option[0].toUpperCase() + option.slice(1)
        return every === 1 ? UNITS[option] : `${UNITS[option]}s`
    }

    // Value format of datetime-local inputs, in the browser's own zone
    function toLocalInput(date: Date | null): string {
        if(!date) return ''
        const pad = (value: number) => String(value).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function nextFullHour(): Date {
        const now = new Date()
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1)
    }

    // A cleared date field leaves nothing to save
    let start = $derived(at ? new Date(at) : null)
    let valid = $derived(!!start && !isNaN(start.getTime()) && (repeat !== 'weekdays' || weekdays.length > 0))

    // DAYS | switching to weekdays starts with the day of the first time, today without one
    function pickRepeat(value: ReminderRepeat){
        repeat = value
        if(value !== 'weekdays' || weekdays.length) return
        const day = start && !isNaN(start.getTime()) ? start : new Date()
        weekdays = [WEEKDAYS[(day.getDay() + 6) % 7].value]
    }

    function toggleDay(day: Weekday){
        const picked = weekdays.includes(day) ? weekdays.filter((item) => item !== day) : [...weekdays, day]
        weekdays = WEEKDAYS.map((item) => item.value).filter((item) => picked.includes(item))
    }

    // ACTIONS
    function close(saved = false){
        open = false
        onclose?.(saved)
    }

    async function save(){
        if(!valid || !start) return
        saving = true
        const rule = {
            at: start.toISOString(),
            repeat,
            every: counted ? every : 1,
            weekdays: repeat === 'weekdays' ? weekdays : [],
            until: until && repeat !== 'never' ? new Date(`${until}T23:59:59`).toISOString() : '',    // the last day counts whole
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            task
        }
        const note = reminder ? reminder.note : await ensureNote()
        const saved = note && await safeAction(reminder ? updateReminder({ id: reminder.id, ...rule }) : addReminder({ note, ...rule }))
        saving = false
        if(saved) close(true)
    }

    async function remove(){
        if(!reminder) return close()
        saving = true
        if(await safeAction(removeReminder(reminder.id))) close()
        saving = false
    }

    // TRANSITIONS | the band morphs its height around a swap, so the new part only fades in
    function enter(node: Element){
        return animate ? rise(node, { y: 0, scale: 1, blur: 0, duration: 'base', delay: 60 }) : {}
    }

    function widen(node: Element){
        return animate ? unfold(node, { axis: 'x' }) : {}
    }

    // Last day on the line, in the zone the reminder was set in
    function endOf(reminder: Reminder): string {
        const date = parseTimestamp(reminder.until)
        return date ? ` until ${date.toLocaleDateString('en-GB', { timeZone: reminder.timezone, day: 'numeric', month: 'short' })}` : ''
    }

    // A closed card leaves out "Once", the date alone says it
    function summary(reminder: Reminder): string {
        const next = reminder.next ? formatMoment(reminder.next, reminder.timezone) : ''
        const rule = !editable && reminder.repeat === 'never' ? '' : describeRule(reminder) + endOf(reminder)
        return [rule, next].filter(Boolean).join(' · ')
    }
</script>

{#if open && editable}
    <!-- FORM | takes the place of the line -->
    <form class="reminder-form flex flex-col gap-1.5 py-1" onsubmit={(event) => { event.preventDefault(); save() }} in:enter|global>
        <div class="flex flex-wrap items-center gap-1.5">
            <input type="datetime-local" bind:value={at} aria-label="First time" class="field flex-1 basis-44 bg-raised px-2.5 text-sm" />

            <div class="flex items-center gap-1.5">
                {#if counted}
                    <div class="flex items-center gap-1.5" in:widen out:widen>
                        <span class="type-meta pl-1">every</span>
                        <NumberField bind:value={every} label="Every" class="w-16" />
                    </div>
                {/if}
                <select value={repeat} aria-label="Repeat" class="field bg-raised px-2.5 text-sm" onchange={(event) => pickRepeat(event.currentTarget.value as ReminderRepeat)}>
                    {#each REPEATS as option (option)}
                        <option value={option}>{optionLabel(option)}</option>
                    {/each}
                </select>
            </div>
        </div>

        <!-- DAYS | Monday first -->
        {#if repeat === 'weekdays'}
            <div class="flex gap-1" role="group" aria-label="Days" in:enter>
                {#each WEEKDAYS as day (day.value)}
                    {@const on = weekdays.includes(day.value)}
                    <button type="button" class={['day type-meta', on && 'on']} aria-pressed={on} aria-label={day.short} onclick={() => toggleDay(day.value)}>
                        {day.short.slice(0, 2)}
                    </button>
                {/each}
            </div>
        {/if}

        <div class="flex flex-wrap items-center gap-1.5">
            {#if repeat !== 'never'}
                <label class="flex min-w-0 items-center gap-1.5" in:enter>
                    <span class="type-meta pl-1">until</span>
                    <input type="date" bind:value={until} min={at.slice(0, 10)} aria-label="Last day" class={['field bg-raised px-2.5 text-sm', !until && 'text-ink-faint']} />
                </label>
            {/if}

            <div class="ml-auto flex items-center">
                <button type="button" class={['icon-button', task && 'text-accent']} aria-label="Done button in the notification" aria-pressed={task} onclick={() => task = !task} {@attach tip(task ? 'The notification can be checked off with a Done button' : 'Add a Done button to the notification')}>
                    <ListChecks class="size-4" />
                </button>
                {#if reminder}
                    <button type="button" class="icon-button" aria-label="Remove reminder" disabled={saving} onclick={remove} {@attach tip('Remove reminder')}>
                        <Trash2 class="size-4" />
                    </button>
                {:else}
                    <button type="button" class="icon-button" aria-label="Discard" disabled={saving} onclick={remove}>
                        <X class="size-4" />
                    </button>
                {/if}
                <button type="submit" class="icon-button text-accent" aria-label="Save reminder" disabled={saving || !valid} {@attach tip('Save reminder')}>
                    <Check class="size-4" />
                </button>
            </div>
        </div>
    </form>
{:else if reminder}
    <!-- LINE | hatched while a task waits to be checked off -->
    {@const due = isOpenTask(reminder)}
    <div class={['line flex min-h-9 items-center gap-2', due && 'due', !editable && 'quiet']} in:enter|global>
        <button class={['type-meta flex min-w-0 flex-1 items-center gap-2 text-left', editable ? 'hover:text-ink' : 'pointer-events-none']} tabindex={editable ? 0 : -1} aria-label={`Edit reminder ${describeRule(reminder)}`} onclick={() => open = true}>
            {#if reminder.task}<ListChecks class="size-3.5 shrink-0" />{:else}<Bell class="size-3.5 shrink-0" />{/if}
            <span class="truncate">{summary(reminder)}</span>
            {#if !editable && reminder.next}
                <span class="ml-auto shrink-0">{formatDistance(reminder.next, now())}</span>
            {/if}
        </button>
        {#if due && ondone}
            <button class="type-meta motion-interactive pointer-events-auto relative flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-on-accent hover:brightness-110" onclick={ondone}>
                <Check class="size-3" /> Done
            </button>
        {/if}
        {@render trailing?.()}
    </div>
{:else}
    <button class="add-reminder type-meta flex min-h-9 items-center gap-2 hover:text-ink" onclick={() => open = true} in:enter|global>
        <BellPlus class="size-3.5" /> Add reminder
    </button>
{/if}

<style>
    .day {
        display: grid;
        flex: 1;
        place-items: center;
        height: 2rem;
        border: 1px solid var(--theme-line);
        border-radius: var(--layout-radius-control);
        background: var(--theme-raised);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
    }

    .day:hover {
        border-color: var(--theme-line-strong);
        color: var(--theme-ink);
    }

    .day.on {
        border-color: var(--theme-accent);
        background: var(--theme-accent);
        color: var(--theme-on-accent);
    }

    .line.quiet:not(.due) {
        color: var(--theme-ink-faint);
    }

    /* Hatch runs across the whole band, not just the text */
    .line.due {
        margin-inline: calc(-1 * var(--layout-card-padding));
        padding-inline: var(--layout-card-padding);
        color: var(--theme-ink);
        background-image: repeating-linear-gradient(-45deg, transparent 0 0.375rem, color-mix(in oklab, var(--theme-accent) 20%, transparent) 0.375rem 0.75rem);
    }
</style>
