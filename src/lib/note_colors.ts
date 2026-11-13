import type { NoteColor } from '#lib/schemas/notes.ts';

// Notes and labels share them, each name has a [data-note] rule in note_colors.css
export const NOTE_TINTS = ['plain', 'lemon', 'ochre', 'tangerine', 'coral', 'cherry', 'rose', 'magenta', 'plum', 'violet', 'cobalt', 'sky', 'powder', 'teal', 'mint', 'moss', 'slate', 'platinum'] as const;
export const NOTE_SOLIDS = ['tangerine-solid', 'coral-solid', 'cherry-solid', 'rose-solid', 'magenta-solid', 'plum-solid', 'violet-solid', 'midnight-solid', 'cobalt-solid', 'sky-solid', 'powder-solid', 'teal-solid', 'mint-solid', 'moss-solid', 'forest-solid', 'slate-solid', 'graphite-solid', 'black-solid'] as const;
export const NOTE_STICKIES = ['canary', 'marigold', 'apricot', 'peach', 'flamingo', 'bubblegum', 'candy', 'orchid', 'lilac', 'periwinkle', 'cornflower', 'aqua', 'ice', 'seafoam', 'pistachio', 'lime', 'chartreuse', 'cloud'] as const;
export const NOTE_PATTERNS = ['ruled', 'legal', 'graph', 'dots', 'linen', 'gingham', 'zigzag', 'sakura', 'topo', 'waves', 'stripes', 'kraft', 'chalkboard', 'blueprint', 'starry', 'aurora', 'sunset', 'holo', 'crosshatch', 'pinstripe', 'parchment', 'washi', 'canvas', 'seigaiha', 'honeycomb', 'argyle', 'subway', 'polka', 'plaid', 'confetti', 'denim', 'neon', 'sunburst', 'ocean', 'rainbow', 'bokeh'] as const;
export const NOTE_FLAGS = ['rainbow-flag', 'lesbian-flag', 'gay-flag', 'bisexual-flag', 'trans-flag', 'pansexual-flag', 'asexual-flag', 'intersex-flag', 'nonbinary-flag'] as const;
export const NOTE_COLORS = [...NOTE_TINTS, ...NOTE_SOLIDS, ...NOTE_STICKIES, ...NOTE_PATTERNS, ...NOTE_FLAGS] as const;



// PICKING ==============================================
// Order of the palette wherever a color gets picked | Default follows the labels, Plain ignores them
export const COLOR_GROUPS: { name: string, colors: readonly NoteColor[] }[] = [
    { name: 'Default', colors: [''] },
    { name: 'Soft', colors: NOTE_TINTS },
    { name: 'Sticky', colors: NOTE_STICKIES },
    { name: 'Solid', colors: NOTE_SOLIDS },
    { name: 'Pattern', colors: [...NOTE_PATTERNS, ...NOTE_FLAGS] },
]

// New labels pick one so they never all look alike
export function randomLabelColor(): NoteColor {
    const choices = [...NOTE_TINTS.filter((color) => color !== 'plain'), ...NOTE_SOLIDS, ...NOTE_STICKIES]
    return choices[Math.floor(Math.random() * choices.length)]
}

// Turns 'cobalt-solid' into 'Cobalt solid'
export function colorName(color: NoteColor): string {
    if(!color) return 'Default'
    const words = color.replace('-', ' ')
    return words[0].toUpperCase() + words.slice(1)
}
