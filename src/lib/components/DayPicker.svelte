<script lang="ts">
    import { WEEKDAYS } from '#lib/reminders.ts';
    import type { Weekday } from '#lib/schemas.ts';

    // PROPS
    let {
        value = $bindable(),
        label = 'Days'
    }: {
        value: Weekday[]
        label?: string
    } = $props()

    // Picks stay in week order, Monday first
    function toggle(day: Weekday){
        const picked = value.includes(day) ? value.filter((item) => item !== day) : [...value, day]
        value = WEEKDAYS.map((item) => item.value).filter((item) => picked.includes(item))
    }
</script>

<div class="flex flex-1 gap-1" role="group" aria-label={label}>
    {#each WEEKDAYS as day (day.value)}
        {@const on = value.includes(day.value)}
        <button type="button" class={['day type-meta', on && 'on']} aria-pressed={on} aria-label={day.short} onclick={() => toggle(day.value)}>
            {day.short.slice(0, 2)}
        </button>
    {/each}
</div>

<style>
    .day {
        display: grid;
        flex: 1;
        place-items: center;
        height: 2rem;
        border: 1px solid var(--theme-line);
        border-radius: var(--layout-radius-control);
        background: var(--theme-raised);
        transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), scale var(--duration-base) var(--ease-spring);
    }

    .day:hover {
        border-color: var(--theme-line-strong);
        color: var(--theme-ink);
    }

    .day:active {
        scale: 0.92;
    }

    .day.on {
        border-color: var(--theme-accent);
        background: var(--theme-accent);
        color: var(--theme-on-accent);
    }
</style>
