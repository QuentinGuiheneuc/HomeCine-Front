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

/**
 * Config d'un serveur Snapcast → sections de snapserver.conf.
 * Reflet de `SnapServerConfigSchema` côté serveur, qui refuse toute clé
 * inconnue : n'ajouter un champ ici qu'une fois ajouté au schéma. Les valeurs
 * omises prennent le défaut du générateur, rappelé en commentaire.
 */
export interface SnapServerConfig {
  server?: { buffer?: number; datadir?: string }                                  // buffer = 0
  http?:   { enabled?: boolean; bind?: string; port?: number; docRoot?: string }  // 0.0.0.0:1780
  tcp?:    { enabled?: boolean; bind?: string; port?: number }                    // 127.0.0.1:1705
  stream?: { bind?: string; port?: number; chunkMs?: number; codec?: string; sampleformat?: string } // 0.0.0.0:1704, 10 ms, flac, 48000:16:2
}

export interface SnapServer {
  id:        number
  ip:        string
  port?:     number
  name?:     string
  enabled:   boolean
  isLocal?:  boolean
  config?:   SnapServerConfig
  /** null = liste jamais définie : le serveur local publie alors tous les FIFO activés. */
  fifos?:    Array<number | { id: number; [k: string]: any }> | null
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

export interface SnapServerPayload {
  ip:       string
  port?:    number
  name?:    string
  enabled?: boolean
  isLocal?: boolean
  config?:  SnapServerConfig
  /** Absent : liste inchangée. `[]` : aucun stream. `null` : retour au défaut. */
  fifos?:   number[] | null
}

/**
 * Crée OU met à jour un serveur : `POST /snap/servers` est un upsert par `ip`.
 *
 * `config` REMPLACE l'ancienne en bloc — envoyer l'objet complet, jamais un
 * fragment, sinon les sections omises disparaissent de snapserver.conf. Les
 * champs de premier niveau (`port`, `name`, `enabled`, `isLocal`) sont eux
 * conservés quand ils sont absents.
 *
 * Remplace l'ancien `PUT /snap/servers/:ip/fifos`, retiré côté serveur : la
 * liste des flux se règle maintenant ici, ou tube par tube via
 * `PUT /fifo/:id/enabled`.
 */
export async function saveSnapServer(payload: SnapServerPayload): Promise<SnapServer> {
  return unwrap(await http.post('/snap/servers', payload))
}

/** Alias historique — même route, même upsert. */
export const createSnapServer = saveSnapServer

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
