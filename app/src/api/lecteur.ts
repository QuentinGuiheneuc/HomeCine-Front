import http from '../lib/https'

export type LecteurConfig = Record<string, any>

export type ConfEq = {
  rate: number
  config: string
  path_eq: string
  order: string[]
}
export type Lecteur = {
  id: number
  name: string
  type: string
  isStarting: number | boolean
  config: LecteurConfig
  conf_eq: ConfEq | null
  url: Array<{ url: string; type: string }>
}
// GET /lecteur
export async function getLecteurs(): Promise<Lecteur[]> {
  const res = await http.get('/lecteur')
  // selon ton backend: soit res.data = [], soit res.data = { data: [] }
  return res.data?.data ?? res.data ?? []
}

// GET /lecteur/:id (si existe) sinon fallback côté front
export async function getLecteur(id: number): Promise<Lecteur | null> {
  try {
    const res = await http.get(`/lecteur/${id}`)
    return res.data?.data ?? res.data ?? null
  } catch {
    const all = await getLecteurs()
    return all.find(l => l.id === id) ?? null
  }
}

// POST /lecteur
export async function createLecteur(payload: {
  name: string
  type: string
  config: LecteurConfig
  conf_eq: ConfEq | null
}) {
  const res = await http.post('/lecteur', payload)
  return res.data
}

// PUT /lecteur/:id
export async function updateLecteur(id: number, payload: Partial<Lecteur>) {
  return http.put(`/lecteur/${id}`, payload)
}

// DELETE /lecteur/:id
export async function deleteLecteur(id: number) {
  return http.delete(`/lecteur/${id}`)
}
