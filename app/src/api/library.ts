import http from '../lib/https'
import appConfig from '../config'

/**
 * Résout une URL de cover :
 * - null/undefined → null (le composant affiche un placeholder)
 * - http(s) ou data: → telle quelle
 * - chemin relatif (ex. /library/cover/...) → préfixé par API_URL (/proxy)
 */
export function resolveCoverUrl(url?: string | null): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  return appConfig.API_URL + (url.startsWith('/') ? url : '/' + url)
}

/**
 * Client API Library — bibliothèque musicale multi-source (fileplayer, spotify…).
 * Les `enqueue` enfilent dans le lecteur relié (sélectionné via Set.select).
 */

export type LibrarySource = 'fileplayer' | 'spotify' | string

export interface LibraryTrack {
  source:       LibrarySource
  id?:          string
  sourceId?:    string
  uri?:         string | null
  title:        string
  artists:      string[]
  album?:       string | null
  date?:        string | null
  coverUrl?:    string | null
  cover_url?:   string | null
  durationMs?:  number | null
  duration_ms?: number | null
  lecteurId?:   number
  [k: string]:  any
}

export interface LibraryPlaylist {
  source:       LibrarySource
  id:           string
  name:         string
  description?: string | null
  cover_url?:   string | null
  track_count?: number | null
  [k: string]:  any
}

export interface LibraryAlbum {
  source:       LibrarySource
  id?:          string
  sourceId?:    string
  name:         string
  artists?:     string[]
  date?:        string | null
  coverUrl?:    string | null
  cover_url?:   string | null
  year?:        string | number | null
  trackCount?:  number | null
  track_count?: number | null
  lecteurId?:   number
  [k: string]:  any
}

/** Résout l'id d'un album (id ou sourceId selon la source) */
export function resolveId(item: { id?: string; sourceId?: string }): string {
  return item.id ?? item.sourceId ?? ''
}

export interface LibraryArtist {
  source:     LibrarySource
  id:         string
  name:       string
  cover_url?: string | null
  [k: string]: any
}

export interface LibraryCategory {
  source?:    LibrarySource
  id:         string
  name:       string
  cover_url?: string | null
  [k: string]: any
}

export interface LibraryProvider {
  id:          LibrarySource
  name:        string
  source?:     LibrarySource
  lecteurId?:  number | null
  canReindex?: boolean
  active?:     boolean
  enabled?:    boolean
  [k: string]: any
}

export interface SearchResult {
  tracks?:    LibraryTrack[]
  albums?:    LibraryAlbum[]
  artists?:   LibraryArtist[]
  playlists?: LibraryPlaylist[]
  [k: string]: any
}

/** Normalise sources en CSV pour les query params */
function srcParam(sources?: LibrarySource[]): string | undefined {
  return sources?.length ? sources.join(',') : undefined
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/* ── Providers / index ─────────────────────────────────────────────────────── */

export async function getProviders(): Promise<LibraryProvider[]> {
  const raw = unwrap<any[]>(await http.get('/library/providers')) ?? []
  // Normalise : l'API renvoie { source, lecteurId, canReindex } → on expose id/name
  return raw.map((p: any) => ({
    ...p,
    id:   p.id   ?? p.source,
    name: p.name ?? p.source,
  }))
}

export async function reindex(source?: LibrarySource) {
  return http.post('/library/reindex', source ? { source } : {})
}

/* ── Recherche ─────────────────────────────────────────────────────────────── */

export async function search(q: string, opts: { limit?: number; sources?: LibrarySource[] } = {}): Promise<SearchResult> {
  return unwrap(await http.get('/library/search', {
    params: { q, limit: opts.limit ?? 20, sources: srcParam(opts.sources) }
  }))
}

/* ── Enqueue ───────────────────────────────────────────────────────────────── */

/** Enfile une piste dans la file du lecteur relié (payload minimal : source, uri, lecteurId) */
export async function enqueueTrack(track: LibraryTrack, lecteurId?: number) {
  return http.post('/library/enqueue', {
    track: {
      source:    track.source,
      uri:       track.uri,
      lecteurId: lecteurId ?? track.lecteurId,
    }
  })
}

/** Lit un contexte (playlist/album/artiste/piste) sur le lecteur relié */
export type PlayType = 'playlist' | 'album' | 'artist' | 'track'
export async function play(args: {
  source: LibrarySource
  type:   PlayType
  id?:    string
  uri?:   string
  lecteurId?: number
}) {
  return http.post('/library/play', {
    source:    args.source,
    type:      args.type,
    ...(args.uri ? { uri: args.uri } : { id: args.id }),
    lecteurId: args.lecteurId,
  })
}

/* ── Catégories ────────────────────────────────────────────────────────────── */

export async function getCategories(opts: { sources?: LibrarySource[]; limit?: number } = {}): Promise<LibraryCategory[]> {
  return unwrap(await http.get('/library/categories', {
    params: { sources: srcParam(opts.sources), limit: opts.limit }
  }))
}

/* ── Playlists ─────────────────────────────────────────────────────────────── */

export async function getPlaylists(opts: { category?: string; q?: string; sources?: LibrarySource[]; limit?: number } = {}): Promise<LibraryPlaylist[]> {
  return unwrap(await http.get('/library/playlists', {
    params: { category: opts.category, q: opts.q, sources: srcParam(opts.sources), limit: opts.limit }
  }))
}

export async function getPlaylistTracks(source: LibrarySource, id: string, limit?: number): Promise<LibraryTrack[]> {
  return unwrap(await http.get(`/library/playlists/${source}/${id}/tracks`, { params: { limit } }))
}

/** Enfile toute la playlist dans le lecteur relié */
export async function enqueuePlaylist(source: LibrarySource, id: string, lecteurId?: number) {
  return http.post(`/library/playlists/${source}/${id}/enqueue`, lecteurId != null ? { lecteurId } : {})
}

/* ── Albums ────────────────────────────────────────────────────────────────── */

export async function getAlbums(opts: { q?: string; sources?: LibrarySource[]; limit?: number } = {}): Promise<LibraryAlbum[]> {
  return unwrap(await http.get('/library/albums', {
    params: { q: opts.q, sources: srcParam(opts.sources), limit: opts.limit }
  }))
}

export async function getAlbumTracks(source: LibrarySource, id: string): Promise<LibraryTrack[]> {
  return unwrap(await http.get(`/library/albums/${source}/${encodeURIComponent(id)}/tracks`))
}

/* ── Artistes ──────────────────────────────────────────────────────────────── */

export async function getArtists(opts: { q?: string; sources?: LibrarySource[]; limit?: number } = {}): Promise<LibraryArtist[]> {
  return unwrap(await http.get('/library/artists', {
    params: { q: opts.q, sources: srcParam(opts.sources), limit: opts.limit }
  }))
}

export async function getArtistAlbums(source: LibrarySource, id: string): Promise<LibraryAlbum[]> {
  return unwrap(await http.get(`/library/artists/${source}/${id}/albums`))
}

export async function getArtistTracks(source: LibrarySource, id: string): Promise<LibraryTrack[]> {
  return unwrap(await http.get(`/library/artists/${source}/${id}/tracks`))
}
