// TYPES
export type NotificationType = 'success' | 'error' | 'info'

// One button on the toast, like Undo | it dismisses the toast once pressed
export type NotificationAction = {
    label: string
    run: () => unknown
}

type NotificationOptions = {
    duration?: number
    type?: NotificationType
    action?: NotificationAction
}

export type Notification = {
    id: number
    content: string
    type: NotificationType
    action?: NotificationAction
}

// STATE | rendered once by Toaster.svelte in the root layout
export const notifications = $state<Notification[]>([])
let nextId = 0

// SHOW A TOAST | errors stay longer since they usually need reading
export function notify(content: string, options?: NotificationOptions){
    const type = options?.type ?? 'success'
    const duration = options?.duration ?? (type === 'error' ? 8000 : 4500)

    const id = nextId++
    notifications.push({ id, content, type, action: options?.action })
    setTimeout(() => dismiss(id), duration)
}

export function dismiss(id: number){
    const index = notifications.findIndex((notification) => notification.id === id)
    if(index !== -1) notifications.splice(index, 1)
}
