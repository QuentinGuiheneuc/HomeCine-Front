import http from '../lib/https'

/**
 * Client API « librespot » — token Spotify par utilisateur (scopé req.user),
 * + endpoints admin (voir/gérer le token de n'importe quel user).
 * L'état correspond au champ `token` renvoyé sur /lecteur (connected/verified/expiresAt).
 */

export interface LibrespotState {
  userId?:    number
  connected?: boolean
  verified?:  boolean
  expiresAt?: number | null    // timestamp ms
  user?:      string | null    // libellé compte Spotify si dispo
  [k: string]: any
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/* ── Utilisateur courant ────────────────────────────────────────────────── */

/** Démarre l'OAuth → { url, state } (URL à ouvrir en popup/redirect) */
export async function getLibrespotAuthorizeUrl(): Promise<{ url: string; state?: string }> {
  return unwrap(await http.get('/credentials/librespot/authorize'))
}

/** Échange l'autorisation contre un token (URL de redirection complète, ou code) */
export async function exchangeLibrespot(payload: { redirectUrl?: string; code?: string; state?: string }): Promise<LibrespotState> {
  return unwrap(await http.post('/credentials/librespot/exchange', payload))
}

/** Vérifie / rafraîchit le token courant → { valid } */
export async function verifyLibrespot(): Promise<{ valid: boolean; [k: string]: any }> {
  return unwrap(await http.get('/credentials/librespot/verify'))
}

/** État du token courant */
export async function getLibrespotState(): Promise<LibrespotState | null> {
  return unwrap(await http.get('/credentials/librespot'))
}

/** Supprime le token courant */
export async function deleteLibrespot() {
  return http.delete('/credentials/librespot')
}

/* ── Admin ──────────────────────────────────────────────────────────────── */

/** Liste tous les tokens (masqués) */
export async function getAllLibrespot(): Promise<LibrespotState[]> {
  const d = unwrap<any>(await http.get('/credentials/librespot/all'))
  return Array.isArray(d) ? d : (d?.items ?? d?.tokens ?? [])
}

/** État du token d'un user */
export async function getLibrespotUser(userId: number | string): Promise<LibrespotState | null> {
  return unwrap(await http.get(`/credentials/librespot/user/${encodeURIComponent(String(userId))}`))
}

/** Vérifie / rafraîchit le token d'un user → { valid } */
export async function verifyLibrespotUser(userId: number | string): Promise<{ valid: boolean; [k: string]: any }> {
  return unwrap(await http.get(`/credentials/librespot/user/${encodeURIComponent(String(userId))}/verify`))
}

/** Supprime le token d'un user */
export async function deleteLibrespotUser(userId: number | string) {
  return http.delete(`/credentials/librespot/user/${encodeURIComponent(String(userId))}`)
}
