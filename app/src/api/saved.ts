import http from '../lib/https'
import { unpage, pageParams, type LibraryTrack, type LibraryArtist, type LibrarySource, type Page, type PageParams } from './library'

/**
 * Client API « saved » — titres aimés et artistes suivis (par source).
 * Les objets ajoutés proviennent des résultats de /library/search.
 */

const srcParam = (sources?: LibrarySource[]) => (sources?.length ? sources.join(',') : undefined)

/* ── Titres aimés ───────────────────────────────────────────────────────── */

export async function getSavedTracks(sources?: LibrarySource[], opts: PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get('/library/saved/tracks', { params: { sources: srcParam(sources), ...pageParams(opts) } }))
}

export async function addSavedTrack(track: LibraryTrack) {
  return http.post('/library/saved/tracks', { track })
}

export async function removeSavedTrack(id: number | string) {
  // id peut être un chemin fichier (fileplayer) → encoder pour ne pas casser la route
  return http.delete(`/library/saved/tracks/${encodeURIComponent(id)}`)
}

/** Joue tous les titres aimés (routé par source) */
export async function playSavedTracks(mode: 'replace' | 'add' = 'replace') {
  return http.post('/library/saved/tracks/play', { mode })
}

/* ── Artistes suivis ────────────────────────────────────────────────────── */

export async function getSavedArtists(sources?: LibrarySource[], opts: PageParams = {}): Promise<Page<LibraryArtist>> {
  return unpage<LibraryArtist>(await http.get('/library/saved/artists', { params: { sources: srcParam(sources), ...pageParams(opts) } }))
}

export async function addSavedArtist(artist: LibraryArtist) {
  return http.post('/library/saved/artists', { artist })
}

export async function removeSavedArtist(id: number | string) {
  return http.delete(`/library/saved/artists/${encodeURIComponent(id)}`)
}
