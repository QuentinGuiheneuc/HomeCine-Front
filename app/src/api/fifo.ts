import http from '../lib/https'

/**
 * Client API « FIFO » — tubes nommés exposés comme streams dans snapserver.conf.
 * Chemin absolu, confiné sous FIFO_ROOTS côté serveur (/tmp, <projet>/data).
 * Après toute modification : POST /snap/sync (cf. syncSnap) pour régénérer la conf.
 */

/** Profondeur d'échantillon acceptée par un FIFO. */
export type FifoBits = 16 | 24 | 32

export interface Fifo {
  id:         number
  path:       string
  label:      string
  enabled:      boolean    // exposé comme stream dans snapserver.conf
  /* Le format est porté par TROIS champs distincts depuis la refonte de l'API.
     `sampleformat` reste renvoyé, recomposé par le serveur, mais en LECTURE
     SEULE : l'écrire n'aurait aucun effet, c'est `rate`/`bits`/`channels` qui
     font foi. */
  rate?: number
  bits?: FifoBits
  channels?: number
  sampleformat?: string // "<rate>:<bits>:<canaux>" — recomposé, lecture seule
  createdAt?:   string
  exists:       boolean    // le FIFO est réellement présent sur le disque
  [k: string]: any
}

/** Format d'un FIFO, écrit champ par champ (plus de chaîne à composer). */
export interface FifoFormat {
  rate?: number
  bits?: FifoBits
  channels?: number
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
export async function createFifo(payload: { path: string; label?: string } & FifoFormat): Promise<FifoCreated> {
  const res = await http.post('/fifo', payload, { validateStatus: s => s === 200 || s === 201 || s === 207 })
  const data = res.data?.data ?? res.data ?? res
  return { ...data, ok: res.status === 207 ? false : (data?.ok ?? true) }
}

/** Modifie chemin, libellé et/ou format d'un FIFO déjà référencé. */
export async function updateFifo(
  id: number | string,
  patch: { path?: string; label?: string } & FifoFormat
): Promise<Fifo> {
  return unwrap(await http.put(`/fifo/${id}`, patch))
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
