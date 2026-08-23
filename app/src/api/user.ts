import http from '../lib/https'

type GetUserProfile = {
  name?: string
  email?: string
  settings?: {
    ui?: {
      primary?: string
      neutral?: string
    }
  }
  appearance?: string
}

export async function GetUserProfile() {
  const res = await http.get('/user')
  return res.data
}
export async function GetUserAll() {
  const res = await http.get('/user/all')
  return res.data
}

export interface AppUser {
  id:        number
  email:     string
  type?:     string | null
  name?:     string
  settings?: string
  [k: string]: any
}

/** Liste des utilisateurs (admin) — normalisée en tableau */
export async function getUsers(): Promise<AppUser[]> {
  const res = await http.get('/user/all')
  const d = res.data?.data ?? res.data ?? []
  return Array.isArray(d) ? d : (d?.items ?? d?.users ?? [])
}
