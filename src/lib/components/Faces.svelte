<script lang="ts">
    import type { Person } from '#lib/schemas/notes.ts';

    let { people }: { people: Person[] } = $props()
</script>

<!-- The first three by initial, the rest as a count -->
<span class="flex -space-x-1.5">
    {#each people.slice(0, 3) as person (person.id)}
        <span class="face type-meta grid size-6 place-items-center rounded-full bg-secondary-soft text-ink">{person.name.slice(0, 1).toUpperCase()}</span>
    {/each}
    {#if people.length > 3}
        <span class="face type-meta grid size-6 place-items-center rounded-full bg-line text-ink-muted">+{people.length - 3}</span>
    {/if}
</span>

<style>
    /* A ring in the card's own colour keeps overlapping faces apart */
    .face {
        box-shadow: 0 0 0 2px var(--note-bg, var(--theme-card));
        line-height: 1;
        text-box: trim-both cap alphabetic;     /* Centres the capital itself, not the line box */
    }
</style>
