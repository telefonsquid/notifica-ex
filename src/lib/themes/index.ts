import z from 'zod';

// THEME REGISTRY | every entry needs a matching src/lib/themes/<name>.css
export const THEMES = [
    { name: 'charcoal', label: 'Charcoal', scheme: 'dark' },
    { name: 'platinum', label: 'Platinum', scheme: 'light' },
] as const;

export type ThemeName = typeof THEMES[number]['name'];
export const themeNameSchema = z.enum(THEMES.map((theme) => theme.name) as [ThemeName, ...ThemeName[]]);

export const DEFAULT_THEME: ThemeName = 'charcoal';
export const THEME_COOKIE = 'theme';

export function isThemeName(value: unknown): value is ThemeName { return themeNameSchema.safeParse(value).success }
