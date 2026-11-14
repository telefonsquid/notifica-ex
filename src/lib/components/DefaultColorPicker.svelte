<script lang="ts">
    import { colorName } from '#lib/note_colors.ts';
    import type { NoteColor } from '#lib/schemas/notes.ts';
    import ColorPicker from './ColorPicker.svelte';

    // PROPS
    let { value, onpick }: { value: NoteColor, onpick: (color: NoteColor) => void } = $props()
</script>

<!-- A card like the other appearance options, with a small note wearing the color -->
<div class="flex items-center gap-5 rounded-card border border-line bg-card p-card text-ink">
    <div class="note-surface flex h-20 w-32 shrink-0 flex-col gap-1.5 overflow-hidden rounded-control border border-line-strong p-3 text-ink" data-note={value || undefined} aria-hidden="true">
        <span class="type-title truncate text-sm">New note</span>
        <span class="h-1 w-4/5 rounded-full bg-current opacity-35"></span>
        <span class="h-1 w-3/5 rounded-full bg-current opacity-35"></span>
        <span class="h-1 w-2/3 rounded-full bg-current opacity-35"></span>
    </div>
    <span class="type-title min-w-0 flex-1 truncate text-lg">{value ? colorName(value) : 'None'}</span>
    <ColorPicker {value} {onpick} label="Color of new notes" />
</div>
