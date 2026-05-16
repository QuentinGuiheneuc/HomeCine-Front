import http from '../lib/https'

export interface BrowserSession {
  id: string
  ikey: string
  browser: string
  userId: number
  userEmail: string
  lastSeen: string
  createdAt: string
  revoked: boolean
  ip?: string
}

export interface BrowserLog {
  id: string
  browserId: string
  action: string
  url?: string
  ip?: string
  date: string
  status?: number
}

export async function getBrowsers(): Promise<BrowserSession[]> {
  const res = await http.get('/admin/browsers')
  return res.data
}

export async function getBrowserLogs(id: string): Promise<BrowserLog[]> {
  const res = await http.get(`/admin/browsers/${id}/logs`)
  return res.data
}

export async function revokeBrowser(id: string): Promise<void> {
  await http.post(`/admin/browsers/${id}/revoke`)
}

export async function restoreBrowser(id: string): Promise<void> {
  await http.post(`/admin/browsers/${id}/restore`)
}

export interface GlobalLogsFilters {
  browserId?: string
  userId?: number
}

export async function getGlobalLogs(filters: GlobalLogsFilters = {}): Promise<BrowserLog[]> {
  const res = await http.get('/admin/logs', { params: filters })
  return res.data
}
