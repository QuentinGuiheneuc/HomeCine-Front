import http from '../lib/https'

export interface BrowserSession {
  id: number
  browser_id: string
  user_agent: string
  first_seen: number   // Unix timestamp
  last_seen: number    // Unix timestamp
  last_user_id: number | null
  revoked: 0 | 1
  browser_label: string | null
  user_email: string | null
}

export interface BrowserLog {
  id: number
  browser_id: string
  ikey: string | null
  user_id: number | null
  user_email: string | null
  method: string
  path: string
  status: number
  ip: string
  created_at: number  // Unix timestamp
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
  browser_id?: string
  user_id?: number
}

export async function getGlobalLogs(filters: GlobalLogsFilters = {}): Promise<BrowserLog[]> {
  const res = await http.get('/admin/logs', { params: filters })
  return res.data
}

export interface DeleteLogsFilters {
  browser_id?: string
  user_id?: number
  before?: number  // Unix timestamp
}

export async function deleteLogs(filters: DeleteLogsFilters = {}): Promise<void> {
  await http.delete('/admin/logs', { params: filters })
}

export async function deleteBrowserLogs(id: number): Promise<void> {
  await http.delete(`/admin/browsers/${id}/logs`)
}
