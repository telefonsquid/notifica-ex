<script lang="ts">
    import { duration, easing, emerge, rise, unfold } from '#lib/motion.ts';
    import type { ReminderLimit } from '#lib/schemas.ts';
    import { WEEKDAYS } from '#lib/reminders.ts';
    import Button from '#lib/ui/Button.svelte';
    import Glider from '#lib/ui/Glider.svelte';
    import DayPicker from '#lib/components/DayPicker.svelte';
    import { CalendarDays, CalendarRange, Clock, Plus, SlidersHorizontal, X } from '@lucide/svelte';
    import { Dialog } from 'bits-ui';
    import type { Snippet } from 'svelte';
    import { fade } from 'svelte/transition';

    // PROPS
    let {
        open = $bindable(false),
        until = $bindable(),
        limits = $bindable(),
        start,
        summary,
        recurring,
        anchor,
        schedule
    }: {
        open?: boolean
        until: string                   // last day as yyyy-mm-dd, empty for no end
        limits: ReminderLimit[]
        start: string                   // first time as datetime-local value, new rules start around it
        summary: string                 // the rule as the card line reads it
        recurring: boolean              // end and rules only apply to a repeat
        anchor?: HTMLElement            // the button the panel grows out of and shrinks back into
        schedule: Snippet               // start and repeat fields, bound to the form behind
    } = $props()

    const MODES = [{ value: 'only', text: 'Only' }, { value: 'except', text: 'Except' }]
    const KINDS = [{ value: 'times', text: 'Times', icon: Clock }, { value: 'days', text: 'Days', icon: CalendarDays }, { value: 'dates', text: 'Dates', icon: CalendarRange }]

    // RULES | a new one or a switched kind starts from something sensible around the first time
    function add(){
        limits.push({ mode: 'only', kind: 'times', from: '09:00', to: '17:00' })
    }

    function switchKind(index: number, kind: ReminderLimit['kind']){
        const { mode } = limits[index]
        const day = start.slice(0, 10)
        limits[index] =
            kind === 'times' ? { mode, kind, from: '09:00', to: '17:00' }
            : kind === 'days' ? { mode, kind, days: [WEEKDAYS[(new Date(start).getDay() + 6) % 7].value] }
            : { mode, kind, from: day, to: day }
    }

    // Sections follow the panel in one after another
    function follow(node: Element, { index = 0 } = {}){
        return rise(node, { delay: 120 + index * 50, y: 8, duration: 'base' })
    }

    function fold(node: Element){
        return unfold(node)
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Portal>
        <Dialog.Overlay forceMount>
            {#snippet child({ props, open })}
                {#if open}
                    <div {...props} class="scrim fixed inset-0 z-[72]" transition:fade={{ duration: duration('base'), easing: easing('out') }}></div>
                {/if}
            {/snippet}
        </Dialog.Overlay>
        <Dialog.Content forceMount onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); anchor?.focus({ preventScroll: true }) }}>
            {#snippet child({ props, open: shown })}
                {#if shown}
                    <div {...props} class="fixed inset-0 z-[73] grid place-items-center p-gutter outline-none" onclick={(event) => { if(event.target === event.currentTarget) open = false }}>
                        <div class="panel flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-card border border-line-strong bg-raised text-ink shadow-2xl" in:emerge={{ anchor }} out:emerge={{ anchor, leaving: true }}>
                            <!-- HEADER | the line updates while rules change -->
                            <div class="flex items-start gap-3 p-card pb-4">
                                <span class="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><SlidersHorizontal class="size-4" /></span>
                                <div class="grid min-w-0 flex-1 gap-0.5 pt-0.5">
                                    <Dialog.Title class="type-title text-lg">Advanced</Dialog.Title>
                                    <Dialog.Description class="type-meta truncate">{summary}</Dialog.Description>
                                </div>
                                <Dialog.Close class="icon-button -mt-1 -mr-2" aria-label="Close"><X class="size-4" /></Dialog.Close>
                            </div>

                            <div class="flex min-h-0 flex-col gap-5 overflow-y-auto px-card pb-2">
                                <div class="grid gap-5" in:follow={{ index: 0 }}>
                                    {@render schedule()}
                                </div>

                                {#if recurring}
                                    <!-- Folding and the stagger need separate elements -->
                                    <div class="grid" transition:fold>
                                        <div class="grid gap-5" in:follow={{ index: 1 }}>
                                            <!-- END -->
                                            <section class="grid gap-2">
                                                <h3 class="type-meta">End on</h3>
                                                <div class="flex items-center gap-1.5">
                                                    <input type="date" bind:value={until} min={start.slice(0, 10)} aria-label="Last day" class={['field min-w-0 flex-1', !until && 'text-ink-faint']} />
                                                    {#if until}
                                                        <button type="button" class="icon-button" aria-label="Clear end" onclick={() => until = ''} transition:unfold={{ axis: 'x' }}><X class="size-3.5" /></button>
                                                    {/if}
                                                </div>
                                            </section>

                                            <!-- RULES | only and except, the empty state says what they do -->
                                            <section class="grid gap-2">
                                                <h3 class="type-meta">Rules</h3>
                                                {#if !limits.length}
                                                    <p class="empty text-sm text-ink-faint" transition:fold>Ring only at certain times, days or dates, or never at them.</p>
                                                {/if}
                                                {#each limits as limit, index (limit)}
                                                    <div class="rule grid grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-2.5 rounded-control border border-line p-2.5" transition:fold>
                                                        <div class="flex flex-wrap items-center gap-2">
                                                            <Glider name="Only or except" options={MODES} value={limit.mode} onpick={(mode) => limit.mode = mode as ReminderLimit['mode']} class="w-32" />
                                                            <Glider name="Limit by" options={KINDS} value={limit.kind} onpick={(kind) => switchKind(index, kind as ReminderLimit['kind'])} class="min-w-48 flex-1" />
                                                        </div>
                                                        <button type="button" class="icon-button -my-0.5 -mr-1 self-start" aria-label="Remove rule" onclick={() => limits.splice(index, 1)}><X class="size-3.5" /></button>

                                                        {#key limit.kind}
                                                            <div class="col-span-2 flex items-center gap-1.5" in:rise={{ y: 4, duration: 'base' }}>
                                                                {#if limit.kind === 'times'}
                                                                    <input type="time" bind:value={limit.from} aria-label="From" required class="field min-w-0 flex-1" />
                                                                    <span class="type-meta">to</span>
                                                                    <input type="time" bind:value={limit.to} aria-label="To" required class="field min-w-0 flex-1" />
                                                                {:else if limit.kind === 'days'}
                                                                    <DayPicker bind:value={limit.days} />
                                                                {:else}
                                                                    <input type="date" bind:value={limit.from} aria-label="From" required class="field min-w-0 flex-1" />
                                                                    <span class="type-meta">to</span>
                                                                    <input type="date" bind:value={limit.to} aria-label="To" required class="field min-w-0 flex-1" />
                                                                {/if}
                                                            </div>
                                                        {/key}
                                                    </div>
                                                {/each}
                                            </section>
                                        </div>
                                    </div>
                                {/if}
                            </div>

                            <!-- FOOTER -->
                            <div class="flex items-center gap-2 p-card pt-4" in:follow={{ index: 2 }}>
                                {#if recurring}
                                    <span transition:fade={{ duration: duration('fast') }}><Button style="ghost" icon={Plus} onclick={add}>Add rule</Button></span>
                                {/if}
                                <Button class="ml-auto" onclick={() => open = false}>Done</Button>
                            </div>
                        </div>
                    </div>
                {/if}
            {/snippet}
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    .scrim {
        background: rgb(0 0 0 / 0.4);
    }

    .rule {
        background: color-mix(in oklab, var(--theme-line) 35%, transparent);
    }
</style>
