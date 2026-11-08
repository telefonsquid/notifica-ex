import { THEMES, type ThemeName } from '#lib/themes/index.ts';

// Which card edge the label tabs hang from
export type LabelPosition = 'top' | 'bottom'

// Cropped to fill the card, or whole with plain ground around it
export type ImageFit = 'cropped' | 'whole'

export type Preferences = { theme: ThemeName, labels: LabelPosition, images: ImageFit }
export type PreferenceName = keyof Preferences

// Per device, in a cookie of this name and on <html data-name> before first paint, app.html has a %name% for each | the first choice is the default
const CHOICES: { [N in PreferenceName]: readonly Preferences[N][] } = {
    theme: THEMES.map((theme) => theme.name),
    labels: ['top', 'bottom'],
    images: ['cropped', 'whole'],
}

export const PREFERENCE_NAMES = Object.keys(CHOICES) as [PreferenceName, ...PreferenceName[]]

function choose<N extends PreferenceName>(name: N, value: string | undefined): Preferences[N] {
    const choices: readonly Preferences[N][] = CHOICES[name]
    return choices.find((choice) => choice === value) ?? choices[0]
}

export function isChoice(name: PreferenceName, value: string) {
    return (CHOICES[name] as readonly string[]).includes(value)
}

// Unknown and missing ones fall back to the default
export function readPreferences(cookie: (name: string) => string | undefined): Preferences {
    return { theme: choose('theme', cookie('theme')), labels: choose('labels', cookie('labels')), images: choose('images', cookie('images')) }
}
