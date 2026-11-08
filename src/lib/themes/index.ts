// THEME REGISTRY | every entry needs a matching src/lib/themes/<name>.css, the first one is the default
export const THEMES = [
    { name: 'platinum', label: 'Platinum', scheme: 'light' },
    { name: 'charcoal', label: 'Charcoal', scheme: 'dark' },
] as const;

export type ThemeName = typeof THEMES[number]['name'];
