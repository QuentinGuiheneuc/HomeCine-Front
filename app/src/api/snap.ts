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
