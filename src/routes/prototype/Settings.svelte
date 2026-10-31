<script lang="ts">
    import Tick from './Tick.svelte'

    // Stand ins until settings are stored per account
    let topic = $state('')
    let week = $state<'monday' | 'sunday'>('monday')
    let sound = $state(true)
</script>

<div class="settings">
    <p class="type-meta heading">ntfy topic</p>
    <input class="field" placeholder="reminders" bind:value={topic} />

    <p class="type-meta heading">week starts</p>
    {#each ['monday', 'sunday'] as const as day, index (day)}
        <button class="option" aria-pressed={week === day} onclick={() => week = day}>
            <Tick on={week === day} seed={120 + index} />
            {day}
        </button>
    {/each}

    <p class="type-meta heading">reminders</p>
    <button class="option" aria-pressed={sound} onclick={() => sound = !sound}>
        <Tick on={sound} seed={130} />
        play a sound
    </button>
</div>

<style>
    .settings {
        display: flex;
        flex-direction: column;
        padding: calc(var(--cell) / 2) var(--cell) var(--cell);
    }

    .heading {
        margin-top: calc(var(--cell) / 2);
        line-height: calc(var(--cell) * 1.5);
        color: var(--ink-faint);
    }

    .field {
        line-height: calc(var(--cell) * 1.5);
        border-bottom: 1px solid var(--rule);
        background: none;
        outline: none;
        color: var(--ink);
    }

    .field::placeholder {
        color: var(--ink-faint);
    }

    .option {
        display: flex;
        gap: calc(var(--cell) / 2);
        align-items: center;
        line-height: calc(var(--cell) * 1.5);
        color: var(--ink-soft);
        cursor: pointer;
        transition: color var(--duration-fast) var(--ease-out);
    }

    .option:hover, .option[aria-pressed='true'] {
        color: var(--ink);
    }
</style>
