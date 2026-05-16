import { createSharedComposable } from '@vueuse/core'
import type { AppNotification, NotificationEventType, NotificationPreferences } from '~/types'
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  getNotificationHistory,
  markNotificationsRead,
  subscribePush,
  unsubscribePush,
  getVapidPublicKey
} from '~/src/api/notifications'

const DEFAULT_PREFERENCES: NotificationPreferences = {
  channels: { desktop: false, email: false, inApp: true },
  events: {
    device_online: true,
    device_offline: true,
    error: true,
    unauthorized: true,
    update: true,
    track_change: false
  }
}

const TOAST_COLOR: Record<NotificationEventType, string> = {
  device_online:  'success',
  device_offline: 'warning',
  error:          'error',
  unauthorized:   'error',
  update:         'info',
  track_change:   'neutral'
}

const EVENT_ICON: Record<NotificationEventType, string> = {
  device_online:  'i-lucide-wifi',
  device_offline: 'i-lucide-wifi-off',
  error:          'i-lucide-circle-x',
  unauthorized:   'i-lucide-shield-alert',
  update:         'i-lucide-refresh-cw',
  track_change:   'i-lucide-music'
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

const _useNotifications = () => {
  const toast = useToast()
  const history = ref<AppNotification[]>([])
  const preferences = ref<NotificationPreferences>(DEFAULT_PREFERENCES)
  const pushSubscribed = ref(false)
  const loading = ref(false)
  const saving = ref(false)

  const unreadCount = computed(() => history.value.filter(n => !n.read).length)

  async function loadPreferences() {
    loading.value = true
    try {
      preferences.value = await getNotificationPreferences()
    } catch {
      // Serveur ne supporte pas encore les préférences, on garde les défauts
    } finally {
      loading.value = false
    }
  }

  async function persistPreferences() {
    saving.value = true
    try {
      await saveNotificationPreferences(preferences.value)
    } finally {
      saving.value = false
    }
  }

  async function loadHistory() {
    try {
      history.value = await getNotificationHistory()
    } catch {}
  }

  async function markAllRead() {
    const unread = history.value.filter(n => !n.read).map(n => n.id)
    if (!unread.length) return
    history.value.forEach(n => (n.read = true))
    await markNotificationsRead(unread).catch(() => {})
  }

  // ── Push navigateur ────────────────────────────────────────────────────────

  async function checkPushStatus() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready.catch(() => null)
    if (!reg) return
    const sub = await reg.pushManager.getSubscription().catch(() => null)
    pushSubscribed.value = !!sub
  }

  async function enablePush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      toast.add({ title: 'Push non supporté', description: 'Votre navigateur ne supporte pas les notifications push.', color: 'error' as any })
      return
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      toast.add({ title: 'Permission refusée', description: 'Activez les notifications dans les paramètres du navigateur.', color: 'warning' as any })
      return
    }

    try {
      const publicKey = await getVapidPublicKey()
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      })
      await subscribePush(sub.toJSON())
      pushSubscribed.value = true
      preferences.value.channels.desktop = true
      toast.add({ title: 'Notifications activées', color: 'success' as any })
    } catch (e) {
      toast.add({ title: 'Erreur push', description: String(e), color: 'error' as any })
    }
  }

  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      await unsubscribePush()
      pushSubscribed.value = false
      preferences.value.channels.desktop = false
    } catch {}
  }

  // ── Notification in-app + toast ───────────────────────────────────────────

  function notify(type: NotificationEventType, title: string, body: string, url?: string) {
    const eventsPrefs = preferences.value.events
    if (!eventsPrefs[type]) return

    const n: AppNotification = {
      id: crypto.randomUUID(),
      type,
      title,
      body,
      date: new Date().toISOString(),
      read: false,
      url
    }
    history.value.unshift(n)

    if (preferences.value.channels.inApp) {
      toast.add({
        title,
        description: body,
        color: TOAST_COLOR[type] as any,
        icon: EVENT_ICON[type]
      })
    }
  }

  return {
    history,
    preferences,
    pushSubscribed,
    unreadCount,
    loading,
    saving,
    loadPreferences,
    persistPreferences,
    loadHistory,
    markAllRead,
    checkPushStatus,
    enablePush,
    disablePush,
    notify,
    EVENT_ICON
  }
}

export const useNotifications = createSharedComposable(_useNotifications)
