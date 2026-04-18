import type { ConfEq, Lecteur } from '@/types/lecteur'
import http from '../lib/https'

export type { ConfEq, Lecteur }

export type LecteurPayload = {
  name: string
  type: string
  config: Record<string, any>
  conf_eq_id: number | null
}

export async function getLecteurs(): Promise<Lecteur[]> {
  const res = await http.get('/lecteur')
  return res.data?.data ?? res.data ?? []
}

export async function getLecteur(id: number): Promise<Lecteur | null> {
  try {
    const res = await http.get(`/lecteur/${id}`)
    const data = res.data?.data ?? res.data ?? null
    return Array.isArray(data) ? (data[0] ?? null) : data
  } catch {
    const all = await getLecteurs()
    return all.find(l => l.id === id) ?? null
  }
}

export async function createLecteur(payload: LecteurPayload) {
  const res = await http.post('/lecteur', payload)
  return res.data
}

export async function updateLecteur(id: number, payload: Partial<LecteurPayload>) {
  return http.put(`/lecteur/${id}`, payload)
}

export async function deleteLecteur(id: number) {
  return http.delete(`/lecteur/${id}`)
}

export async function startLecteur(id: number) {
  return http.put(`/lecteur/${id}/start`)
}

export async function stopLecteur(id: number) {
  return http.put(`/lecteur/${id}/stop`)
}

export async function postSpotifyUrl(url: string, name: string) {
  return http.post('/spotify/audio', { url, name })
}
