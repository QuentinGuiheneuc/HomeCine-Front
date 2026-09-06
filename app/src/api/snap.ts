import http from '../lib/https'

/**
 * Client API Snapcast — persistance / restauration de l'état (groupes/clients).
 * GET /snap/state (lire la conf sauvegardée), POST /snap/restore (réappliquer),
 * DELETE /snap/state (effacer). La restauration est best-effort : elle réassemble
 * les groupes par appartenance de clients (les group_id changent au redémarrage).
 */

export interface SnapSavedState {
  [k: string]: any
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/** Conf sauvegardée (ou null si aucune) */
export async function getSnapState(): Promise<SnapSavedState | null> {
  return unwrap(await http.get('/snap/state'))
}

/** Réapplique la conf sauvegardée (groupes/noms/streams/volumes…) */
export async function restoreSnap(): Promise<any> {
  return unwrap(await http.post('/snap/restore', {}))
}

/** Efface la conf sauvegardée */
export async function clearSnapState() {
  return http.delete('/snap/state')
}

/** Vrai si la conf sauvegardée n'est pas vide */
export function hasSnapState(s: SnapSavedState | null | undefined): boolean {
  if (!s) return false
  if (Array.isArray(s)) return s.length > 0
  if (typeof s === 'object') return Object.keys(s).length > 0
  return !!s
}

/** Régénère snapserver.conf (à appeler après toute modification des FIFO) */
export async function syncSnap(): Promise<any> {
  return unwrap(await http.post('/snap/sync', {}))
}

/* ── Serveurs Snapcast (/snap/servers) ──────────────────────────────────── */

export interface SnapServer {
  id:        number
  ip:        string
  port?:     number
  name?:     string
  enabled:   boolean
  isLocal?:  boolean
  config?:   any
  fifos?:    Array<number | { id: number; [k: string]: any }>
  [k: string]: any
}

/** Ids des FIFO rattachés (l'API peut renvoyer des ids ou des objets) */
export function serverFifoIds(s: SnapServer | null | undefined): number[] {
  const list = s?.fifos ?? []
  return list.map(f => (typeof f === 'number' ? f : Number(f?.id))).filter(n => Number.isFinite(n))
}

export async function getSnapServers(): Promise<SnapServer[]> {
  const d = unwrap<any>(await http.get('/snap/servers'))
  return Array.isArray(d) ? d : (d?.items ?? d?.servers ?? [])
}

export async function getSnapServer(ip: string): Promise<SnapServer> {
  return unwrap(await http.get(`/snap/servers/${encodeURIComponent(ip)}`))
}

export async function createSnapServer(payload: {
  ip: string; port?: number; name?: string; enabled?: boolean; isLocal?: boolean; config?: any; fifos?: number[]
}): Promise<SnapServer> {
  return unwrap(await http.post('/snap/servers', payload))
}

/** Rattache les FIFO au serveur ([] pour tout retirer) */
export async function setSnapServerFifos(ip: string, fifos: number[] | null) {
  return unwrap<{ ok: boolean; ip: string; fifos: number[] }>(
    await http.put(`/snap/servers/${encodeURIComponent(ip)}/fifos`, { fifos })
  )
}

export async function setSnapServerEnabled(ip: string, enabled: boolean) {
  return unwrap<{ ok: boolean; ip: string; enabled: boolean }>(
    await http.put(`/snap/servers/${encodeURIComponent(ip)}/enabled`, { enabled: !!enabled })
  )
}

/** Génère la conf : écrite sur disque si local, sinon renvoyée pour copie */
export async function applySnapServer(ip: string) {
  return unwrap<{ ok: boolean; ip: string; conf: string; written: boolean; path?: string }>(
    await http.post(`/snap/servers/${encodeURIComponent(ip)}/apply`, {})
  )
}

export async function deleteSnapServer(ip: string) {
  return unwrap<{ ok: boolean }>(await http.delete(`/snap/servers/${encodeURIComponent(ip)}`))
}

/* ── Conf & service ─────────────────────────────────────────────────────── */

/** snapserver.conf brut (proxy si serveur distant) */
export async function getSnapConf(): Promise<string> {
  const res = await http.get('/snap', { responseType: 'text' as any })
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)
}

/** Écrit la conf tenue en mémoire */
export async function saveSnapConf() {
  return unwrap<{ status: string }>(await http.get('/snap/save'))
}

export async function addSnapStream(uri: string) {
  return unwrap<{ status: string; uri: string }>(await http.post('/snap/Stream', { uri }))
}

export async function removeSnapStream(name: string) {
  return unwrap<{ status: string; name: string }>(await http.delete('/snap/Stream', { data: { name } }))
}

export type SnapServiceStatus = 'started' | 'stopped' | 'running' | string

export async function startSnapService() {
  return unwrap<{ status: SnapServiceStatus }>(await http.get('/snap/start'))
}
export async function stopSnapService() {
  return unwrap<{ status: SnapServiceStatus }>(await http.get('/snap/stop'))
}
export async function getSnapServiceStatus() {
  return unwrap<{ status: SnapServiceStatus }>(await http.get('/snap/status'))
}
