<script lang="ts">
    import { now } from '#lib/clock.svelte.ts';
    import { describeRule, isCounted, isOpenTask, localWeekday, normalizeRule, parseTimestamp, UNITS } from '#lib/reminders.ts';
    import { safeAction } from '#lib/safe_action.ts';
    import { formatDistance, formatMoment, toLocalInput } from '#lib/time_format.ts';
    import type { Reminder, ReminderLimit, ReminderRepeat, Weekday } from '#lib/schemas/reminders.ts';
    import DayPicker from '#lib/components/DayPicker.svelte';
    import DoneButton from '#lib/components/DoneButton.svelte';
    import ReminderRules from '#lib/components/ReminderRules.svelte';
    import { rise, unfold } from '#lib/motion.ts';
    import { tip } from '#lib/tooltip.svelte.ts';
    import Choice from '#lib/ui/Choice.svelte';
    import NumberField from '#lib/ui/NumberField.svelte';
    import { Bell, BellPlus, Check, SlidersHorizontal, Square, SquareCheckBig, Trash2, X } from '@lucide/svelte';
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
        onhistory,
        onclose,
        trailing
    }: {
        reminder?: Reminder                         // missing for a new one, which starts open
        ensureNote: () => Promise<string | null>    // saves a new note first, a reminder needs its id
        editable?: boolean                          // a closed card only shows the line, the click goes to the card
        animate?: boolean                           // off while the card itself resizes, its glide covers the change then
        open?: boolean
        ondone?: () => void                         // ticks off the one open time of a task
        onhistory?: (anchor: HTMLElement) => void   // opens the note's history, for picking among several open times
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

    let counted = $derived(isCounted(repeat))
    let tuned = $derived(!!until || limits.length > 0)
    // A cleared date field leaves nothing to save
    let start = $derived(at ? new Date(at) : null)
    let incomplete = $derived(!start || isNaN(start.getTime()) || (repeat === 'weekdays' && !weekdays.length) || limits.some((limit) => limit.kind === 'days' && !limit.days.length))

    // Once and Weekdays sit apart on top, they don't count
    let repeats = $derived([
        [{ value: 'never' as const, label: 'Once' }, { value: 'weekdays' as const, label: 'Weekdays' }],
        INTERVALS.map((value) => ({ value, label: capitalize(counted && every === 1 ? UNITS[value] : value) }))
    ])

    function capitalize(text: string){
        return text[0].toUpperCase() + text.slice(1)
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

    // Today while the date field is empty
    function startDay(): Weekday {
        return localWeekday(start && !isNaN(start.getTime()) ? start : new Date())
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
        if(incomplete || !start) return
        saving = true
        const rule = normalizeRule({
            at: start.toISOString(),
            repeat,
            every,
            weekdays,
            until: until ? new Date(`${until}T23:59:59`).toISOString() : '',    // the last day counts whole
            rules: cleanLimits(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            task
        })
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
        return animate ? rise(node, { y: 0, scale: 1, duration: 'fast' }) : {}
    }

    function widen(node: Element){
        return animate ? unfold(node, { axis: 'x' }) : {}
    }

    function fold(node: Element){
        return animate ? unfold(node) : {}
    }

    // DONE | one open time gets ticked off right away, more open the history to pick from
    function done(event: MouseEvent){
        if(!reminder) return
        if(reminder.open > 1) onhistory?.(event.currentTarget as HTMLElement)
        else ondone?.()
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
    <form class="open-only flex flex-col gap-1.5 py-1" onsubmit={(event) => { event.preventDefault(); save() }} in:enter|global>
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
                <button type="button" class={['icon-button', task && 'bg-accent text-on-accent hover:bg-accent hover:text-on-accent']} aria-label="Done button" aria-pressed={task} onclick={() => task = !task} {@attach tip(task ? 'Remove Done button' : 'Add Done button')}>
                    {#if task}<SquareCheckBig class="size-4" />{:else}<Square class="size-4" />{/if}
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
        <ReminderRules bind:open={advanced} bind:until bind:limits start={at} recurring={repeat !== 'never'} anchor={advancedButton} {schedule} summary={describeRule({ repeat, every, weekdays, rules: limits })} />
    </form>
{:else if reminder}
    <!-- LINE | the Done button pulses while a task waits to be checked off -->
    {@const due = isOpenTask(reminder)}
    <div class={['line flex min-h-9 items-center gap-2', due && 'due', !editable && 'quiet']} in:enter|global>
        <button class={['type-meta flex min-w-0 flex-1 items-center gap-2 text-left', editable ? 'hover:text-ink' : 'pointer-events-none']} tabindex={editable ? 0 : -1} aria-label={`Edit reminder ${describeRule(reminder)}`} onclick={() => open = true}>
            {#if reminder.task}<SquareCheckBig class="size-3.5 shrink-0" />{:else}<Bell class="size-3.5 shrink-0" />{/if}
            <span class="truncate">{summary(reminder)}</span>
            {#if !editable && reminder.next}
                <span class="ml-auto shrink-0">{formatDistance(reminder.next, now())}</span>
            {/if}
        </button>
        {#if due}
            <DoneButton class={['pointer-events-auto', !trailing && !editable && '-mr-1.5']} count={reminder.open} pulse aria-label={reminder.open > 1 ? `${reminder.open} open, show history` : 'Done'} onclick={done} />
        {/if}
        {#if editable}
            <button class={['quick-remove icon-button shrink-0', !trailing && '-mr-2']} aria-label="Remove reminder" disabled={saving} onclick={remove} {@attach tip('Remove reminder')}>
                <Trash2 class="size-4" />
            </button>
        {/if}
        {@render trailing?.()}
    </div>
{:else}
    <button class="open-only type-meta flex min-h-9 items-center gap-2 hover:text-ink" onclick={() => open = true} in:enter|global>
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

    .line.due {
        color: var(--theme-ink);
    }

    /* QUICK REMOVE | mouse only, shows while the line is hovered | touch removes through the form */
    .quick-remove {
        display: none;
    }

    @media (hover: hover) and (pointer: fine) {
        .quick-remove {
            display: grid;
            opacity: 0;
            transition: opacity var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out);
        }

        .line:hover .quick-remove,
        .quick-remove:focus-visible {
            opacity: 1;
        }
    }
</style>
