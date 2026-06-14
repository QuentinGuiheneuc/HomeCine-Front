import http from '../lib/https'

/**
 * Client API Connexions (Auth) — gestion centralisée des comptes par provider.
 * Spotify : flux OAuth (autorisation → callback serveur).
 * Deezer  : connexion par ARL.
 * Les lecteurs (Deezer ARL, Spotify tokens) lisent ce gestionnaire automatiquement.
 */

export type CredentialProvider = 'spotify' | 'deezer' | string

export interface ProviderAccount {
  id?:        number | string
  label?:     string | null
  user?:      string | null
  isDefault?: boolean
  [k: string]: any
}

export interface ProviderStatus {
  provider:  CredentialProvider
  connect:   string            // endpoint de connexion (authorize / connect)
  connected: boolean
  accounts:  ProviderAccount[]
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/** État de tous les providers : connecté ? comptes liés ? */
export async function getProviders(): Promise<ProviderStatus[]> {
  return unwrap(await http.get('/credentials/providers'))
}

/** Spotify : démarre l'OAuth → { url, state } (URL à ouvrir en popup/redirect) */
export async function getSpotifyAuthorizeUrl(label?: string): Promise<{ url: string; state?: string }> {
  return unwrap(await http.get('/credentials/spotify/authorize', { params: label ? { label } : {} }))
}

/** Deezer : connexion par ARL (streaming) → { ok, user } (ou 400 si ARL invalide) */
export async function connectDeezer(arl: string, label?: string): Promise<{ ok: boolean; user?: string }> {
  const res = await http.post('/credentials/deezer/connect', { arl, label })
  return res.data
}

/** Deezer : démarre l'OAuth → { url, state } (URL à ouvrir en popup/redirect) */
export async function getDeezerAuthorizeUrl(label?: string): Promise<{ url: string; state?: string }> {
  return unwrap(await http.get('/credentials/deezer/authorize', { params: label ? { label } : {} }))
}

/** Comptes d'un provider (tokens masqués) */
export async function getAccounts(provider: CredentialProvider): Promise<ProviderAccount[]> {
  return unwrap(await http.get('/credentials', { params: { provider } }))
}

/** Définit le compte par défaut du provider */
export async function setDefaultCredential(id: number | string) {
  return http.put(`/credentials/${id}/default`)
}

/** Déconnecte (supprime) un compte */
export async function deleteCredential(id: number | string) {
  return http.delete(`/credentials/${id}`)
}
