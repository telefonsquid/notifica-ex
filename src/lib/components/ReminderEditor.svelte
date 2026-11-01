<script lang="ts">
    import { now } from '#lib/clock.svelte.ts';
    import { formatDistance, formatMoment, isOpenTask } from '#lib/notes.ts';
    import { safeAction } from '#lib/pocketbase.ts';
    import { describeRule, parseTimestamp, UNITS, WEEKDAYS } from '#lib/reminders.ts';
    import type { Reminder, ReminderLimit, ReminderRepeat, Weekday } from '#lib/schemas.ts';
    import DayPicker from '#lib/components/DayPicker.svelte';
    import ReminderRules from '#lib/components/ReminderRules.svelte';
    import { rise, unfold } from '#lib/motion.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Choice from '#lib/ui/Choice.svelte';
    import NumberField from '#lib/ui/NumberField.svelte';
    import { Bell, BellPlus, Check, ListChecks, SlidersHorizontal, Trash2, X } from '@lucide/svelte';
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

    const INTERVALS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const

    // FORM | starts from the stored rule, or the next full hour for a new one
    const initial = untrack(() => reminder)
    let at = $state(toLocalInput(parseTimestamp(initial?.at) ?? nextFullHour()))
    let repeat = $state<ReminderRepeat>(initial?.repeat ?? 'never')
    let every = $state(initial?.every ?? 1)
    let weekdays = $state<Weekday[]>([...(initial?.weekdays ?? [])])
    let until = $state(toLocalInput(parseTimestamp(initial?.until)).slice(0, 10))
    let limits = $state<ReminderLimit[]>($state.snapshot(initial?.rules ?? []))
    let task = $state(initial?.task ?? false)
    let advanced = $state(false)
    let advancedButton = $state<HTMLElement>()
    let saving = $state(false)

    // Minutes to years take a count and read as "every 3 days"
    let counted = $derived(repeat !== 'never' && repeat !== 'weekdays')
    let tuned = $derived(!!until || limits.length > 0)
    let incomplete = $derived((repeat === 'weekdays' && !weekdays.length) || limits.some((limit) => limit.kind === 'days' && !limit.days.length))

    // Once and Weekdays sit apart on top, they don't count
    let repeats = $derived([
        [{ value: 'never' as const, label: 'Once' }, { value: 'weekdays' as const, label: 'Weekdays' }],
        INTERVALS.map((value) => ({ value, label: capitalize(counted && every === 1 ? UNITS[value] : value) }))
    ])

    function capitalize(text: string){
        return text[0].toUpperCase() + text.slice(1)
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

    // DAYS | switching to weekdays starts with the day of the first time
    function pickRepeat(value: ReminderRepeat){
        repeat = value
        if(value !== 'weekdays' || weekdays.length) return
        weekdays = [startDay()]
    }

    function startDay(): Weekday {
        return WEEKDAYS[(new Date(at).getDay() + 6) % 7].value
    }

    // Date ranges picked backwards get turned round
    function cleanLimits(): ReminderLimit[] {
        return $state.snapshot(limits).map((limit) => limit.kind === 'dates' && limit.from > limit.to ? { ...limit, from: limit.to, to: limit.from } : limit)
    }

    // ACTIONS
    function close(saved = false){
        open = false
        onclose?.(saved)
    }

    async function save(){
        saving = true
        const rule = {
            at: new Date(at).toISOString(),
            repeat,
            every: counted ? every : 1,
            weekdays: repeat === 'weekdays' ? weekdays : [],
            until: until && repeat !== 'never' ? new Date(`${until}T23:59:59`).toISOString() : '',    // the last day counts whole
            rules: repeat === 'never' ? [] : cleanLimits(),
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

    function fold(node: Element){
        return animate ? unfold(node) : {}
    }

    // Last day on the line, in the zone the reminder was set in
    function endOf(reminder: Reminder): string {
        const date = parseTimestamp(reminder.until)
        return date ? ` until ${date.toLocaleDateString('en-GB', { timeZone: reminder.timezone, day: 'numeric', month: 'short' })}` : ''
    }

    // A closed card leaves out "Once", the date alone says it | a reminder with nothing ahead reads finished
    function summary(reminder: Reminder): string {
        const next = reminder.next ? formatMoment(reminder.next, reminder.timezone) : 'Finished'
        const rule = !editable && reminder.repeat === 'never' ? '' : describeRule(reminder) + endOf(reminder)
        return [rule, next].filter(Boolean).join(' · ')
    }
</script>

{#snippet schedule()}
    <!-- SCHEDULE | the row's fields again, laid out for the dialog -->
    <section class="grid gap-2">
        <h3 class="type-meta">Start on</h3>
        <input type="datetime-local" bind:value={at} aria-label="First time" class="field min-w-0" />
    </section>

    <section class="grid gap-2">
        <h3 class="type-meta">Repeat</h3>
        <div class="flex items-center gap-1.5">
            {#if counted}
                <div class="flex items-center gap-1.5" transition:unfold={{ axis: 'x' }}>
                    <span class="type-meta pl-1">Every</span>
                    <NumberField bind:value={every} label="Every" class="w-16" />
                </div>
            {/if}
            <Choice value={repeat} groups={repeats} label="Repeat" class="flex-1" onchange={pickRepeat} />
        </div>
        {#if repeat === 'weekdays'}
            <div class="flex" transition:unfold>
                <DayPicker bind:value={weekdays} />
            </div>
        {/if}
    </section>
{/snippet}

{#if open && editable}
    <!-- FORM | takes the place of the line -->
    <form class="reminder-form flex flex-col gap-1.5 py-1" onsubmit={(event) => { event.preventDefault(); save() }} in:enter|global>
        <!-- ONE ROW | wraps only where the card is too narrow -->
        <div class="flex flex-wrap items-center gap-1.5">
            <div class="flex min-w-0 flex-1 basis-56 items-center gap-1.5">
                {#if repeat !== 'never'}
                    <span class="type-meta shrink-0 pl-1 whitespace-nowrap" transition:widen>Start on</span>
                {/if}
                <input type="datetime-local" bind:value={at} aria-label="First time" class="field min-w-0 flex-1" />
            </div>

            <div class="flex items-center gap-1.5">
                {#if counted}
                    <div class="flex items-center gap-1.5" transition:widen>
                        <span class="type-meta pl-1">Every</span>
                        <NumberField bind:value={every} label="Every" class="w-16" />
                    </div>
                {/if}
                <Choice value={repeat} groups={repeats} label="Repeat" class="w-30" onchange={pickRepeat} />
            </div>

            <div class="ml-auto flex items-center">
            {#if repeat !== 'never'}
                <button type="button" class={['icon-button relative', tuned && 'text-accent']} aria-label="Advanced" aria-haspopup="dialog" bind:this={advancedButton} onclick={() => advanced = true} transition:widen {@attach tip('Advanced')}>
                    <SlidersHorizontal class="size-4" />
                    {#if tuned}<span class="dot" aria-hidden="true"></span>{/if}
                </button>
            {/if}
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
                <button type="submit" class="icon-button text-accent" aria-label="Save reminder" disabled={saving || incomplete} {@attach tip('Save reminder')}>
                    <Check class="size-4" />
                </button>
            </div>
        </div>

        <!-- DAYS | Monday first -->
        {#if repeat === 'weekdays'}
            <div class="flex" transition:fold>
                <DayPicker bind:value={weekdays} />
            </div>
        {/if}

        <!-- ADVANCED | end date and the only and except rules in their own dialog -->
        <ReminderRules bind:open={advanced} bind:until bind:limits start={at} recurring={repeat !== 'never'} anchor={advancedButton} {schedule} summary={describeRule({ repeat, every: counted ? every : 1, weekdays, rules: limits })} />
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
    .dot {
        position: absolute;
        top: 0.3125rem;
        right: 0.3125rem;
        width: 0.375rem;
        height: 0.375rem;
        border-radius: 999px;
        background: var(--theme-accent);
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
