const BROWSER_ALERTS_KEY = 'stocksage_browser_alerts'

export function getBrowserAlertsEnabled(): boolean {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(BROWSER_ALERTS_KEY) === 'true'
}

export function setBrowserAlertsEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(BROWSER_ALERTS_KEY, enabled ? 'true' : 'false')
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied'
    if (Notification.permission === 'granted') return 'granted'
    return Notification.requestPermission()
}

export async function showBrowserNotification(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    if (typeof window === 'undefined') return
    if (!getBrowserAlertsEnabled()) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const registration = await navigator.serviceWorker?.ready
    if (registration) {
        registration.active?.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            body,
            data,
        })
        return
    }

    new Notification(title, { body })
}
