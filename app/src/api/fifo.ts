import http from '../lib/https'

/**
 * Client API « FIFO » — tubes nommés exposés comme streams dans snapserver.conf.
 * Chemin absolu, confiné sous FIFO_ROOTS côté serveur (/tmp, <projet>/data).
 * Après toute modification : POST /snap/sync (cf. syncSnap) pour régénérer la conf.
 */

export interface Fifo {
  id:         number
  path:       string
  label:      string
  enabled:      boolean    // exposé comme stream dans snapserver.conf
  sampleformat?: string    // "<rate>:<bits>:<canaux>" (ex. 48000:16:8) — dérivé du lecteur si absent
  createdAt?:   string
  exists:       boolean    // le FIFO est réellement présent sur le disque
  [k: string]: any
}

/** Réponse de création : ok = créé sur disque, created = venait d'être créé */
export interface FifoCreated extends Fifo {
  ok?:      boolean
  created?: boolean
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

export async function getFifos(): Promise<Fifo[]> {
  const d = unwrap<any>(await http.get('/fifo'))
  return Array.isArray(d) ? d : (d?.items ?? d?.fifos ?? [])
}

export async function getFifo(id: number | string): Promise<Fifo> {
  return unwrap(await http.get(`/fifo/${id}`))
}

/**
 * Crée un FIFO. Le serveur peut répondre 207 : référencé en base mais non créé
 * sur disque (ex. chemin déjà occupé par un fichier ordinaire) → `ok: false`.
 */
export async function createFifo(payload: { path: string; label?: string; sampleformat?: string }): Promise<FifoCreated> {
  const res = await http.post('/fifo', payload, { validateStatus: s => s === 200 || s === 201 || s === 207 })
  const data = res.data?.data ?? res.data ?? res
  return { ...data, ok: res.status === 207 ? false : (data?.ok ?? true) }
}

/** (Re)crée sur disque tous les FIFO référencés */
export async function ensureFifos(): Promise<{ ok: boolean; fifos: Fifo[] }> {
  return unwrap(await http.post('/fifo/ensure', {}))
}

/** Active/désactive l'exposition en stream (booléen strict côté serveur) */
export async function setFifoEnabled(id: number | string, enabled: boolean) {
  return unwrap<{ ok: boolean; id: number; enabled: boolean }>(
    await http.put(`/fifo/${id}/enabled`, { enabled: !!enabled })
  )
}

/** Supprime la référence ; `withFile` supprime aussi le fichier (?file=1) */
export async function deleteFifo(id: number | string, withFile = false) {
  return unwrap<{ ok: boolean; id: number; fileRemoved?: boolean }>(
    await http.delete(`/fifo/${id}`, { params: withFile ? { file: 1 } : {} })
  )
}
