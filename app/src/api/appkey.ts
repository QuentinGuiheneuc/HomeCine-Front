import http from '../lib/https'

/**
 * Client API « Clés d'application » — configuration des providers (app_key).
 * GET /keys renvoie un objet { [provider]: { enabled, …champs } }.
 * Les secrets sont masqués : champ `xSet` (bool) + `xHint` (••••xxxx) en lecture ;
 * on écrit la valeur en clair (`x`) à l'enregistrement.
 */

/** Clés d'un provider (forme variable selon le provider / le catalogue) */
export interface ProviderKeys {
  enabled?: boolean
  [k: string]: any   // clientId, clientSecretSet, clientSecretHint, redirectUri, tokenSet, tokenHint, username…
}

/** Map { spotify: {...}, deezer: {...}, … } */
export type KeysMap = Record<string, ProviderKeys>

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/** Toutes les clés par provider (secrets masqués) */
export async function getKeys(): Promise<KeysMap> {
  return unwrap(await http.get('/keys')) ?? {}
}

/** Schéma des champs attendus par provider */
export async function getKeysCatalog(): Promise<any> {
  return unwrap(await http.get('/keys/catalog'))
}

/** Écrit la config d'un provider : { enabled?, clientId?, clientSecret?, redirectUri?, token?, … } */
export async function setProviderKeys(provider: string, payload: Record<string, any>): Promise<ProviderKeys> {
  return unwrap(await http.put(`/keys/${encodeURIComponent(provider)}`, payload))
}

/** Écrit plusieurs providers d'un coup */
export async function setKeys(payload: KeysMap): Promise<KeysMap> {
  return unwrap(await http.put('/keys', payload))
}

/** Efface (et désactive) la config d'un provider */
export async function deleteProviderKeys(provider: string) {
  return http.delete(`/keys/${encodeURIComponent(provider)}`)
}
