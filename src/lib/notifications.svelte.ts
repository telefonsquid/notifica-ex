// TYPES
type NotificationType = 'success' | 'error' | 'info'

type NotificationAction = {
    label: string
    run: () => void
}

type NotificationOptions = {
    duration?: number
    type?: NotificationType
    action?: NotificationAction     // A button in the toast
    onend?: () => void              // The toast left without its button being pressed
}

type Notification = {
    id: number
    content: string
    type: NotificationType
    action?: NotificationAction
    onend?: () => void
}

// STATE | rendered once by Toaster.svelte in the root layout
export const notifications = $state<Notification[]>([])
let nextId = 0

// SHOW A TOAST | errors stay longer since they usually need reading
export function notify(content: string, options?: NotificationOptions): number {
    const type = options?.type ?? 'success'
    const duration = options?.duration ?? (type === 'error' ? 8000 : 4500)

    const id = nextId++
    notifications.push({ id, content, type, action: options?.action, onend: options?.onend })
    setTimeout(() => dismiss(id), duration)
    return id
}

function take(id: number){
    const index = notifications.findIndex((notification) => notification.id === id)
    return index === -1 ? undefined : notifications.splice(index, 1)[0]
}

export function dismiss(id: number){
    take(id)?.onend?.()
}

// The toast's button was pressed
export function act(id: number){
    take(id)?.action?.run()
}
