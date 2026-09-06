import http from '../lib/https'

/**
 * Client API « Mise à jour » — versions des outils et dépôts git suivis.
 * ⚠️ GET /update ne fait aucun `git fetch` : il rend l'état LOCAL du serveur,
 * il ne signalera donc jamais un retard sur l'origine.
 */

/** Version d'un outil, ou { erreur } s'il n'est pas installé */
export type ToolInfo = string | { erreur: string } | null | undefined

export interface UpdateRepo {
  id:       number
  nom:      string
  chemin:   string
  enabled?: boolean
  branche?: string
  commit?:  string        // "47dabd1 2026-08-27 sujet du commit"
  propre?:  boolean       // false = modifications non commitées sur le serveur
  erreur?:  string        // remplace branche/commit si le dossier est illisible
  [k: string]: any
}

export interface UpdateState {
  ytdlp?:   ToolInfo
  ffmpeg?:  ToolInfo
  python?:  ToolInfo
  node?:    string
  uptimeS?: number
  repos?:   UpdateRepo[]
  [k: string]: any
}

export type InstallEtat = 'en cours' | 'ok' | 'echec' | string

export interface InstallState {
  repo?:   string
  chemin?: string
  etat:    InstallEtat
  debut?:  number
  fin?:    number
  sortie?: string         // les 8 derniers Ko du script
  [k: string]: any
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/* ── Helpers d'affichage ────────────────────────────────────────────────── */

/** Texte lisible d'un outil : sa version, ou le motif d'absence */
export function toolText(t: ToolInfo): string {
  if (t == null) return '—'
  return typeof t === 'string' ? (t || '—') : (t.erreur || '—')
}
/** Vrai si l'outil est installé (version connue) */
export const toolOk = (t: ToolInfo): boolean => typeof t === 'string' && !!t.trim()

/** « 3 j 4 h 12 min » à partir de secondes */
export function formatUptime(sec?: number): string {
  if (!sec || sec < 0) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d ? `${d} j` : '', h ? `${h} h` : '', `${m} min`].filter(Boolean).join(' ')
}

/* ── État global ────────────────────────────────────────────────────────── */

export async function getUpdateState(): Promise<UpdateState> {
  return unwrap(await http.get('/update')) ?? {}
}

/** Met à jour yt-dlp → { ok, avant, apres, changed, sortie } */
export async function updateYtdlp() {
  return unwrap<{ ok: boolean; avant?: string; apres?: string; changed?: boolean; sortie?: string }>(
    await http.post('/update/ytdlp', {})
  )
}

/* ── Dépôts ─────────────────────────────────────────────────────────────── */

export async function getRepos(): Promise<UpdateRepo[]> {
  const d = unwrap<any>(await http.get('/update/repos'))
  return Array.isArray(d) ? d : (d?.items ?? d?.repos ?? [])
}

export async function addRepo(payload: { nom: string; path: string; enabled?: boolean }): Promise<UpdateRepo> {
  return unwrap(await http.post('/update/repos', payload))
}

export async function setRepoEnabled(id: number | string, enabled: boolean) {
  return unwrap<{ ok: boolean; id: number; enabled: boolean }>(
    await http.put(`/update/repos/${id}/enabled`, { enabled: !!enabled })
  )
}

export async function deleteRepo(id: number | string) {
  return unwrap<{ ok: boolean; id: number }>(await http.delete(`/update/repos/${id}`))
}

/* ── install.sh ─────────────────────────────────────────────────────────── */

/** Lance install.sh (202). 409 = déjà en cours, 400 = pas d'install.sh */
export async function startInstall(id: number | string) {
  return unwrap<{ ok: boolean; repo?: string; suivi?: string }>(
    await http.post(`/update/repos/${id}/install`, {})
  )
}

/** État de la dernière exécution (404 si jamais lancée → null) */
export async function getInstall(id: number | string): Promise<InstallState | null> {
  try { return unwrap(await http.get(`/update/repos/${id}/install`)) }
  catch (e: any) { if (e?.response?.status === 404) return null; throw e }
}
