<script lang="ts">
    import ReminderEditor from '#lib/components/ReminderEditor.svelte';
    import type { Reminder } from '#lib/schemas.ts';

    // PROPS
    let {
        reminders,
        ensureNote,
        editable = false,
        ondone
    }: {
        reminders: Reminder[]
        ensureNote: () => Promise<string | null>
        editable?: boolean                          // an open card edits them and can add more
        ondone: (reminder: Reminder) => void
    } = $props()

    // A fresh add row after every new reminder
    let added = $state(0)
</script>

<!-- BAND | a darker strip across the bottom of the card, the shade follows the note color -->
{#if reminders.length || editable}
    <footer class={['band -mx-card mt-auto -mb-card flex flex-col px-card py-1 text-ink-muted', !editable && 'pointer-events-none']}>
        {#each reminders as reminder (reminder.id)}
            <ReminderEditor {reminder} {ensureNote} {editable} ondone={() => ondone(reminder)} />
        {/each}
        {#if editable}
            {#key added}
                <ReminderEditor {ensureNote} editable onclose={() => added++} />
            {/key}
        {/if}
    </footer>
{/if}

<style>
    .band {
        border-bottom-left-radius: calc(var(--layout-radius-card) - 1px);
        border-bottom-right-radius: calc(var(--layout-radius-card) - 1px);
        background-color: var(--theme-note-shade);
    }
</style>
