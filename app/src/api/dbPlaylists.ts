import http from '../lib/https'
import { listItems, type LibraryTrack } from './library'

/**
 * Client API « DB playlists » — playlists personnelles stockées en base.
 * Les pistes proviennent des résultats de /library/search.
 */

export interface DbPlaylist {
  id:           number | string
  name:         string
  description?: string | null
  coverUrl?:    string | null
  trackCount?:  number | null
  tracks?:      LibraryTrack[]
  [k: string]:  any
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/* ── Playlists ──────────────────────────────────────────────────────────── */

export async function getDbPlaylists(): Promise<DbPlaylist[]> {
  return listItems<DbPlaylist>(await http.get('/library/db-playlists', { params: { pageSize: 200 } }))
}

export async function createDbPlaylist(
  name: string,
  source?: string,
  kind: 'playlist' | 'album' = 'playlist'
): Promise<DbPlaylist> {
  const body: Record<string, any> = { name }
  if (source) body.source = source
  if (kind && kind !== 'playlist') body.kind = kind
  return unwrap(await http.post('/library/db-playlists', body))
}

/** Importe une playlist externe par URL (ex: YouTube) → { id, name, count } */
export async function importDbPlaylist(payload: { source: string; url: string; name?: string }): Promise<{ id: number | string; name: string; count: number }> {
  return unwrap(await http.post('/library/db-playlists/import', payload))
}

/** Playlist + ses pistes */
export async function getDbPlaylist(id: number | string): Promise<DbPlaylist> {
  return unwrap(await http.get(`/library/db-playlists/${id}`))
}

export async function updateDbPlaylist(
  id: number | string,
  patch: { name?: string; description?: string; coverUrl?: string }
) {
  return http.put(`/library/db-playlists/${id}`, patch)
}

export async function deleteDbPlaylist(id: number | string) {
  return http.delete(`/library/db-playlists/${id}`)
}

/* ── Pistes ─────────────────────────────────────────────────────────────── */

export async function getDbPlaylistTracks(id: number | string): Promise<LibraryTrack[]> {
  return listItems<LibraryTrack>(await http.get(`/library/db-playlists/${id}/tracks`, { params: { pageSize: 200 } }))
}

/** Ajoute une piste (objet issu de /search) */
export async function addDbPlaylistTrack(id: number | string, track: LibraryTrack) {
  return http.post(`/library/db-playlists/${id}/tracks`, { track })
}

export async function removeDbPlaylistTrack(id: number | string, trackId: number | string) {
  // trackId peut être un chemin fichier (fileplayer) → encoder pour ne pas casser la route
  return http.delete(`/library/db-playlists/${id}/tracks/${encodeURIComponent(trackId)}`)
}

/** Réordonne (from → to) */
export async function moveDbPlaylistTrack(id: number | string, from: number, to: number) {
  return http.put(`/library/db-playlists/${id}/move`, { from, to })
}

/** Joue la playlist — remplace ou ajoute à la file (lecteurId optionnel pour cibler) */
export async function playDbPlaylist(id: number | string, mode: 'replace' | 'add' = 'replace', lecteurId?: number) {
  return http.post(`/library/db-playlists/${id}/play`, lecteurId != null ? { mode, lecteurId } : { mode })
}
