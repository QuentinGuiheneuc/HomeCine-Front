import http from '../lib/https'
import type { AppNotification, NotificationPreferences } from '~/types'

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await http.get('/user/notifications/preferences')
  return res.data
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  await http.put('/user/notifications/preferences', prefs)
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await http.post('/user/notifications/push/subscribe', subscription)
}

export async function unsubscribePush(): Promise<void> {
  await http.delete('/user/notifications/push/subscribe')
}

export async function getVapidPublicKey(): Promise<string> {
  const res = await http.get('/notifications/vapid-key')
  return res.data.publicKey
}

export async function getNotificationHistory(): Promise<AppNotification[]> {
  const res = await http.get('/notifications')
  return res.data
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  await http.put('/notifications/read', { ids })
}
