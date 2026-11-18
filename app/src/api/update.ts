import http, { unwrap } from '../lib/https'

/**
 * Client API « Mise à jour » — versions des outils et dépôts git suivis.
 * Contrat : HomeCine-Serv/docs/update.md. GET /update ne fait aucun appel réseau ;
 * le retard sur l'origine (`verification`) vient d'un service du serveur (toutes les heures).
 */

/** Version d'un outil, ou { erreur } s'il n'est pas installé */
export type ToolInfo = string | { erreur: string } | null | undefined

/** Dernière comparaison avec l'origine ; `erreur` : fetch impossible ou branche sans suivi distant */
export interface RepoVerification {
  enRetard?: number
  erreur?: string
  le: string
}

export interface UpdateRepo {
  /** absent quand la liste vient du repli (base vide) : rien à activer ni installer */
  id?:      number
  nom:      string
  chemin:   string
  enabled?: boolean
  branche?: string
  commit?:  string        // "47dabd1 2026-08-27 sujet du commit"
  propre?:  boolean       // false = modifications non commitées sur le serveur
  erreur?:  string        // remplace branche/commit si le dossier est illisible
  /** absente avant la première vérification, et pour un dépôt désactivé */
  verification?: RepoVerification
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

/**
 * Badge du retard sur l'origine (doc §6) ; null avant la première vérification.
 * `dispo` : formulé « N commits disponibles » (clone OTA, docs/ota.md §2).
 */
export function verifBadge(v?: RepoVerification, dispo = false) {
  if (!v) return null
  if (v.erreur) return { label: 'origine non vérifiée', color: 'warning' as const, info: v.erreur }
  const n = v.enRetard ?? 0
  const info = `vérifié le ${new Date(v.le).toLocaleString()}`
  if (!n) return { label: 'à jour', color: 'success' as const, info }
  const s = n > 1 ? 's' : ''
  return { label: dispo ? `${n} commit${s} disponible${s}` : `${n} commit${s} de retard`, color: 'info' as const, info }
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

/** git fetch + retard sur l'origine, tout de suite (jusqu'à ~40 s). Un fetch raté est dans `verification.erreur`. */
export async function verifyRepo(id: number | string) {
  return unwrap<{ id: number, nom: string, verification: RepoVerification }>(
    await http.post(`/update/repos/${id}/verify`, {})
  )
}

export interface RepoBranche {
  nom: string
  /** existe dans le dépôt du serveur */
  locale: boolean
  /** existe sur l'origine, au dernier fetch */
  distante: boolean
}

/** Réponse de …/pull et …/branch (aussi en 400, avec ok: false : refusé par git, rien n'est touché) */
export interface RepoAction {
  id: number
  nom: string
  ok: boolean
  sortie: string
  /** même forme qu'une entrée de GET /update : remplace la carte du dépôt */
  etat?: UpdateRepo
}

/** git pull --ff-only, sans rien installer ni redémarrer. 409 = installation en cours */
export async function pullRepo(id: number | string) {
  return unwrap<RepoAction>(await http.post(`/update/repos/${id}/pull`, {}))
}

/** Branches locales et distantes (au dernier fetch, aucun appel réseau) */
export async function getBranches(id: number | string) {
  return unwrap<{ id: number, nom: string, actuelle: string, branches: RepoBranche[] }>(
    await http.get(`/update/repos/${id}/branches`)
  )
}

/** git switch (une branche seulement distante est créée et suit l'origine). Rien n'est installé. */
export async function setBranch(id: number | string, branche: string) {
  return unwrap<RepoAction>(await http.put(`/update/repos/${id}/branch`, { branche }))
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
