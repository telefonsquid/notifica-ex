<script lang="ts">
    import { colorName } from '#lib/note_colors.ts';
    import type { NoteColor } from '#lib/schemas/notes.ts';
    import ColorPicker from './ColorPicker.svelte';

    // PROPS
    let { value, onpick }: { value: NoteColor, onpick: (color: NoteColor) => void } = $props()
</script>

<!-- The whole card opens the picker and wears the color, like a new note would -->
<ColorPicker {value} {onpick} label="Color of new notes" class="motion-interactive flex w-full overflow-hidden rounded-card border border-line bg-card text-left text-ink hover:border-line-strong">
    <span class="note-surface flex w-full items-center gap-3 p-3 sm:gap-5 sm:p-card" data-note={value || undefined}>
        <span class="flex h-16 w-24 shrink-0 flex-col gap-1.5 overflow-hidden rounded-control border border-line-strong p-2.5 sm:h-20 sm:w-32 sm:p-3" aria-hidden="true">
            <span class="type-title truncate text-sm">New note</span>
            <span class="h-1 w-4/5 rounded-full bg-current opacity-35"></span>
            <span class="h-1 w-3/5 rounded-full bg-current opacity-35"></span>
            <span class="h-1 w-2/3 rounded-full bg-current opacity-35"></span>
        </span>
        <span class="type-title min-w-0 flex-1 truncate sm:text-lg">{value ? colorName(value) : 'None'}</span>
    </span>
</ColorPicker>
