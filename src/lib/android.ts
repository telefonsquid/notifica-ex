import { THEMES } from '#lib/themes/index.ts';

// Set by MainActivity in the Android app, missing in any browser
declare global {
    interface Window { NotificaAndroid?: { statusBar(light: boolean): void } }
}

// STATUS BAR | dark icons on light themes, the phone's own dark mode would otherwise pick them
// Overlays with their own backdrop pass their scheme instead
export function syncStatusBar(scheme?: 'light' | 'dark'){
    if(!window.NotificaAndroid) return
    scheme ??= THEMES.find((theme) => theme.name === document.documentElement.dataset.theme)?.scheme
    window.NotificaAndroid.statusBar(scheme !== 'dark')
}
