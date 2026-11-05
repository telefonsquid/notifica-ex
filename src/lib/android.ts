import { THEMES } from '#lib/themes/index.ts';

// Set by MainActivity in the Android app, missing in any browser | an older app lacks the optional ones
declare global {
    interface Window {
        NotificaAndroid?: {
            statusBar(light: boolean): void
            listen?(url: string): void
            stopListening?(): void
            notificationsOn?(): boolean
            notificationsAllowed?(): boolean
            setNotifications?(on: boolean): void
            openNotificationSettings?(): void
            pendingLink?(): string | null
        }
    }
}

// STATUS BAR | dark icons on light themes, the phone's own dark mode would otherwise pick them
// Overlays with their own backdrop pass their scheme instead
export function syncStatusBar(scheme?: 'light' | 'dark'){
    if(!window.NotificaAndroid) return
    scheme ??= THEMES.find((theme) => theme.name === document.documentElement.dataset.theme)?.scheme
    window.NotificaAndroid.statusBar(scheme !== 'dark')
}

// A notification tapped while the app was closed opens its note once the server's page is up
export function followPendingLink(){
    const link = window.NotificaAndroid?.pendingLink?.()
    if(link) location.replace(link)
}
