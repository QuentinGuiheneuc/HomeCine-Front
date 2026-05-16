import type { AvatarProps } from '@nuxt/ui'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface User {
  id: number
  name: string
  email: string
  avatar?: AvatarProps
  status: UserStatus
  location: string
}

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Member {
  name: string
  username: string
  role: 'member' | 'owner'
  avatar: AvatarProps
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export interface Notification {
  id: number
  unread?: boolean
  sender: User
  body: string
  date: string
}

export type NotificationEventType =
  | 'device_online'
  | 'device_offline'
  | 'error'
  | 'unauthorized'
  | 'update'
  | 'track_change'

export interface AppNotification {
  id: string
  type: NotificationEventType
  title: string
  body: string
  date: string
  read: boolean
  url?: string
}

export interface NotificationPreferences {
  channels: {
    desktop: boolean
    email: boolean
    inApp: boolean
  }
  events: {
    device_online: boolean
    device_offline: boolean
    error: boolean
    unauthorized: boolean
    update: boolean
    track_change: boolean
  }
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}
