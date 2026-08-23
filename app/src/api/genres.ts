import http from '../lib/https'
import { listItems, unpage, pageParams, type LibraryTrack, type Page, type PageParams } from './library'

/**
 * Client API « genres » — catégories musicales (Pop, Rock, Jazz…), avec leurs
 * pistes. Entité CRUD. Les noms peuvent contenir « / » (ex. « Rap/Hip Hop ») →
 * toujours encoder le `name` dans les routes.
 */

export interface Genre {
  id:          number | string
  name:        string
  coverUrl?:   string | null
  trackCount?: number | null
  tracks?:     LibraryTrack[]
  [k: string]: any
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/* ── Genres ─────────────────────────────────────────────────────────────── */

export async function getGenres(): Promise<Genre[]> {
  return listItems<Genre>(await http.get('/library/genres', { params: { pageSize: 200 } }))
}

/** Lit un genre + ses pistes (par id) */
export async function getGenre(id: number | string): Promise<Genre> {
  return unwrap(await http.get(`/library/genres/${encodeURIComponent(id)}`))
}

export async function createGenre(name: string): Promise<Genre> {
  return unwrap(await http.post('/library/genres', { name }))
}

/** Met à jour un genre (renommage et/ou pochette) */
export async function updateGenre(id: number | string, patch: { name?: string; coverUrl?: string }) {
  return http.put(`/library/genres/${encodeURIComponent(id)}`, patch)
}

export async function deleteGenre(id: number | string) {
  return http.delete(`/library/genres/${encodeURIComponent(id)}`)
}

/* ── Pistes d'un genre ──────────────────────────────────────────────────── */

/** Pistes d'un genre (paginé) avec leur état `like` */
export async function getGenreTracks(name: string, opts: PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get(`/library/genres/${encodeURIComponent(name)}/tracks`, { params: pageParams(opts) }))
}

export async function addGenreTrack(name: string, track: LibraryTrack) {
  return http.post(`/library/genres/${encodeURIComponent(name)}/tracks`, { track })
}

export async function removeGenreTrack(name: string, trackId: number | string) {
  return http.delete(`/library/genres/${encodeURIComponent(name)}/tracks/${encodeURIComponent(trackId)}`)
}
