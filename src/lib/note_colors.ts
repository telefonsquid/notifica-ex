import type { NoteColor } from '#lib/schemas/notes.ts';

// Notes and labels share them, each name has a [data-note] rule in note_colors.css
export const NOTE_TINTS = ['lemon', 'ochre', 'tangerine', 'coral', 'cherry', 'rose', 'magenta', 'plum', 'violet', 'cobalt', 'sky', 'powder', 'teal', 'mint', 'moss', 'slate', 'platinum'] as const;
export const NOTE_SOLIDS = ['tangerine-solid', 'coral-solid', 'cherry-solid', 'rose-solid', 'magenta-solid', 'plum-solid', 'violet-solid', 'midnight-solid', 'cobalt-solid', 'sky-solid', 'powder-solid', 'teal-solid', 'mint-solid', 'moss-solid', 'forest-solid', 'slate-solid', 'graphite-solid', 'black-solid'] as const;
export const NOTE_STICKIES = ['canary', 'marigold', 'apricot', 'peach', 'flamingo', 'bubblegum', 'candy', 'orchid', 'lilac', 'periwinkle', 'cornflower', 'aqua', 'ice', 'seafoam', 'pistachio', 'lime', 'chartreuse', 'cloud'] as const;
export const NOTE_TEXTURES = ['ruled', 'legal', 'graph', 'dots', 'linen', 'gingham', 'zigzag', 'terrazzo', 'topo', 'waves', 'stripes', 'kraft', 'chalkboard', 'blueprint', 'starry', 'aurora', 'sunset', 'holo'] as const;
export const NOTE_COLORS = [...NOTE_TINTS, ...NOTE_SOLIDS, ...NOTE_STICKIES, ...NOTE_TEXTURES] as const;



// PICKING ==============================================
// Order of the palette wherever a color gets picked
export const COLOR_GROUPS: { name: string, colors: readonly NoteColor[] }[] = [
    { name: 'Soft', colors: ['', ...NOTE_TINTS] },
    { name: 'Sticky', colors: NOTE_STICKIES },
    { name: 'Solid', colors: NOTE_SOLIDS },
    { name: 'Texture', colors: NOTE_TEXTURES },
]

// New labels pick one so they never all look alike
export function randomLabelColor(): NoteColor {
    const choices = [...NOTE_TINTS, ...NOTE_SOLIDS, ...NOTE_STICKIES]
    return choices[Math.floor(Math.random() * choices.length)]
}

// Turns 'cobalt-solid' into 'Cobalt solid'
export function colorName(color: NoteColor): string {
    if(!color) return 'Plain'
    const words = color.replace('-', ' ')
    return words[0].toUpperCase() + words.slice(1)
}
