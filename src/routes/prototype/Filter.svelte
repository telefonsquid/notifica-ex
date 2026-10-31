<script lang="ts">
    import { PIGMENTS } from './paper.ts'
    import { LABELS } from './notes.ts'
    import Tick from './Tick.svelte'

    // PROPS
    let { archived = $bindable(), label = $bindable() }: { archived: boolean, label: string | null } = $props()
</script>

<div class="filter">
    <p class="type-meta heading">show</p>
    <button class="option" aria-pressed={archived} onclick={() => archived = !archived}>
        <Tick on={archived} seed={90} />
        archived
    </button>

    <p class="type-meta heading">labels</p>
    {#each LABELS as entry, index (entry.name)}
        <button class="option" aria-pressed={label === entry.name} onclick={() => label = label === entry.name ? null : entry.name}>
            <Tick on={label === entry.name} seed={100 + index} color={PIGMENTS[entry.pigment]} />
            {entry.name}
        </button>
    {/each}

    {#if archived || label}
        <button class="type-meta reset" onclick={() => { archived = false; label = null }}>reset</button>
    {/if}
</div>

<style>
    .filter {
        display: flex;
        flex-direction: column;
        padding: calc(var(--cell) / 2) var(--cell) var(--cell);
    }

    .heading {
        margin-top: calc(var(--cell) / 2);
        line-height: calc(var(--cell) * 1.5);
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

    .reset {
        align-self: flex-start;
        margin-top: calc(var(--cell) / 2);
        color: var(--accent);
        cursor: pointer;
    }
</style>
