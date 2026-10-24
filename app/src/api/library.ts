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
  if (url.startsWith('//')) return 'https:' + url          // URL protocol-relative (ex. //yt3.ggpht.com/…)
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
  like?:        boolean       // titre aimé (renvoyé par search/tracks/db-playlists)
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

/**
 * Id à utiliser pour appeler l'API de source (tracks/albums d'un artiste, album…).
 * Priorité à l'id natif de la source (channelId YouTube, sourceId) sur l'id de ligne DB.
 * Indispensable pour les éléments "suivis/aimés" où `id` est l'id en base.
 */
export function sourceKey(item: any): string {
  return String(item?.channelId ?? item?.sourceId ?? item?.id ?? '')
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
  lecteurId?:  number[] | number | null   // liste des lecteurs rattachés à la source
  canReindex?: boolean
  active?:     boolean
  public?:     boolean       // override persisté, sinon défaut code (spotify=false, autres=true)
  enabled?:    boolean
  [k: string]: any
}

export interface SearchResult {
  tracks?:    LibraryTrack[]
  albums?:    LibraryAlbum[]
  artists?:   LibraryArtist[]
  playlists?: LibraryPlaylist[]
  page?:      number
  hasMore?:   boolean
  total?:     number
  [k: string]: any
}

/** Normalise sources en CSV pour les query params */
function srcParam(sources?: LibrarySource[]): string | undefined {
  return sources?.length ? sources.join(',') : undefined
}

const unwrap = <T>(res: any): T => res?.data?.data ?? res?.data ?? res

/* ── Pagination ─────────────────────────────────────────────────────────────── */

/** Enveloppe paginée renvoyée par l'API : { items, total, page, pageSize, hasMore } */
export interface Page<T> {
  items:    T[]
  total:    number
  page:     number
  pageSize: number
  hasMore:  boolean
}
export interface PageParams { page?: number; pageSize?: number; offset?: number }

/** Normalise une réponse paginée (ou un tableau brut hérité) en Page<T>. */
export function unpage<T>(res: any): Page<T> {
  const d = res?.data?.data ?? res?.data ?? res
  if (Array.isArray(d)) return { items: d, total: d.length, page: 1, pageSize: d.length, hasMore: false }
  const items: T[] = d?.items ?? d?.tracks ?? []
  return {
    items,
    total:    d?.total    ?? items.length,
    page:     d?.page     ?? 1,
    pageSize: d?.pageSize ?? items.length,
    hasMore:  d?.hasMore  ?? false,
  }
}
/** Juste le tableau d'items (listes non paginées côté UI). */
export const listItems = <T>(res: any): T[] => unpage<T>(res).items
/** Query de pagination (cap pageSize à 200, comme l'API). */
export const pageParams = (p: PageParams = {}) => ({
  page:     p.page,
  pageSize: p.pageSize != null ? Math.min(p.pageSize, 10) : undefined,
  offset:   p.offset,
})

/**
 * Récupère TOUTES les pages d'un endpoint paginé et concatène les items.
 * Le serveur peut plafonner pageSize (ex. 50) → on boucle tant que `hasMore`.
 * Garde anti-boucle : 50 pages max.
 */
/**
 * Cache court + déduplication des agrégations de pages.
 * Nécessaire car plusieurs composants (home + sidebar) demandent les mêmes
 * listes en même temps : sans cela, chaque liste est parcourue deux fois, et
 * côté serveur une seule page front = N appels Spotify (limit=10 + curseurs).
 */
const PAGES_TTL_LOCAL  = 30_000     // fileplayer : peu coûteux, on rafraîchit vite
const PAGES_TTL_REMOTE = 5 * 60_000 // Spotify & co : quotas stricts (429 / Retry-After)
const _pagesCache = new Map<string, { at: number; promise: Promise<any[]> }>()

/** Vide le cache (après une réindexation ou une modification de la bibliothèque) */
export function clearLibraryCache() { _pagesCache.clear() }

async function getAllPages<T>(url: string, params: Record<string, any> = {}): Promise<T[]> {
  // pageSize n'est imposé que pour fileplayer (source locale) : de grandes pages
  // y évitent des dizaines d'allers-retours. Aucune autre source ne le déclenche.
  const srcs = String(params.sources ?? '').split(',').map(v => v.trim()).filter(Boolean)
  const localOnly = srcs.includes('fileplayer')

  const key = `${url}?${JSON.stringify(params)}`
  const ttl = localOnly ? PAGES_TTL_LOCAL : PAGES_TTL_REMOTE
  const hit = _pagesCache.get(key)
  if (hit && Date.now() - hit.at < ttl) return (await hit.promise).slice() as T[]

  const promise = (async () => {
    const all: T[] = []
    let page = 1
    for (;;) {
      const res = unpage<T>(await http.get(url, {
        params: { ...params, page, ...(localOnly ? { pageSize: 200 } : {}) }
      }))
      all.push(...res.items)
      // Sources distantes (Spotify…) : on s'arrête à la 1re page. Dérouler tout le
      // catalogue déclenchait des centaines d'appels API et un 429 Retry-After.
      if (!localOnly) break
      if (!res.hasMore || !res.items.length || page >= 50) break
      page++
    }
    return all
  })()

  _pagesCache.set(key, { at: Date.now(), promise })
  promise.catch(() => _pagesCache.delete(key))   // un échec ne se met pas en cache
  return (await promise).slice()
}


/* ── Listes paginées (1re page + « Charger plus ») ───────────────────────────
   À préférer à getPlaylists/getAlbums/getArtists sur les sources distantes :
   dérouler tout le catalogue déclenche des quotas (429 Retry-After). */

export async function getPlaylistsPage(
  opts: { category?: string; q?: string; sources?: LibrarySource[] } & PageParams = {}
): Promise<Page<LibraryPlaylist>> {
  const page = unpage<LibraryPlaylist>(await http.get('/library/playlists', {
    params: { category: opts.category, q: opts.q, sources: srcParam(opts.sources), ...pageParams(opts) }
  }))
  // « Titres aimés » est en tête de SON provider, donc apres toutes les sources
  // distantes dans la liste agregee — 21e element en pratique. On la remonte
  // ici, au seul endroit que la sidebar et l'accueil partagent.
  const i = page.items.findIndex(p => p.source === 'playlist' && String(p.id) === 'likes')
  if (i > 0) page.items.unshift(...page.items.splice(i, 1))
  return page
}

export async function getAlbumsPage(
  opts: { q?: string; sources?: LibrarySource[] } & PageParams = {}
): Promise<Page<LibraryAlbum>> {
  return unpage<LibraryAlbum>(await http.get('/library/albums', {
    params: { q: opts.q, sources: srcParam(opts.sources), ...pageParams(opts) }
  }))
}

export async function getArtistsPage(
  opts: { q?: string; sources?: LibrarySource[] } & PageParams = {}
): Promise<Page<LibraryArtist>> {
  return unpage<LibraryArtist>(await http.get('/library/artists', {
    params: { q: opts.q, sources: srcParam(opts.sources), ...pageParams(opts) }
  }))
}

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

/** Active/désactive l'exposition publique d'une source (override persisté) */
export async function setProviderPublic(source: LibrarySource, isPublic: boolean) {
  const res = await http.put(`/library/providers/${source}/public`, { public: isPublic })
  return res.data
}

/* ── Dossiers racines FilePlayer ───────────────────────────────────────────── */

/** Dossiers racines effectifs (FilePlayer) */
export async function getRoots(): Promise<string[]> {
  const d = unwrap<any>(await http.get('/library/roots'))
  return Array.isArray(d) ? d : (d?.roots ?? [])
}

/** Ajoute un dossier racine (FilePlayer) */
export async function addRoot(root: string) {
  return (await http.post('/library/roots', { root })).data
}

/** Remplace toute la liste des dossiers racines (FilePlayer) */
export async function setRoots(roots: string[]) {
  return (await http.put('/library/roots', { roots })).data
}

/** Retire un dossier racine (FilePlayer) */
export async function deleteRoot(root: string) {
  return (await http.delete('/library/roots', { data: { root } })).data
}

/* ── Recherche ─────────────────────────────────────────────────────────────── */

export async function search(q: string, opts: { limit?: number; sources?: LibrarySource[] } & PageParams = {}): Promise<SearchResult> {
  const raw = unwrap<any>(await http.get('/library/search', {
    params: { q, sources: srcParam(opts.sources), ...pageParams({ ...opts, pageSize: opts.pageSize ?? opts.limit ?? 20 }) }
  }))
  // Tableau, enveloppe paginée { items }, ou section absente → tableau
  const arr = (v: any) => (Array.isArray(v) ? v : (v?.items ?? []))
  // La réponse peut être sectionnée { tracks, albums, … } OU une enveloppe plate de pistes { items }
  const flat = raw?.tracks === undefined
  const tracks = flat ? arr(raw) : arr(raw.tracks)
  // Pagination (sur les pistes) : à la racine si plate, sinon dans la section tracks
  const meta = flat ? raw : raw?.tracks
  return {
    tracks,
    albums:    arr(raw?.albums),
    artists:   arr(raw?.artists),
    playlists: arr(raw?.playlists),
    page:      meta?.page ?? 1,
    hasMore:   meta?.hasMore ?? false,
    total:     meta?.total,
  }
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

/* ── Liste de pistes (toutes les pistes d'une/des source·s) — paginée ───────── */

/** Toutes les pistes d'une source (ex. fileplayer) avec leur état `like` (paginé) */
export async function getTrackliste(opts: { q?: string; sources?: LibrarySource[] } & PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get('/library/trackliste', {
    params: { q: opts.q, sources: srcParam(opts.sources), ...pageParams(opts) }
  }))
}

/** Titres aimés d'un artiste pour une source (paginé) — /library/like/:source?artist= */
export async function getLikedByArtist(source: LibrarySource, artist: string, opts: PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get(`/library/like/${encodeURIComponent(source)}`, {
    params: { artist, ...pageParams(opts) }
  }))
}

/* ── Enrichissement métadonnées (FilePlayer) ───────────────────────────────── */

export interface EnrichResult {
  ok: boolean
  matched?: boolean
  applied?: boolean
  score?: number
  before?: { title?: string | null; artist?: string | null; album?: string | null; date?: string | null }
  found?: { title?: string; artist?: string; album?: string; [k: string]: any }
  written?: string[]
  /** `true` = une pochette a ete integree AU FICHIER. Ce n'est PAS une URL. */
  cover?: boolean
  /** dryRun : nom que prendrait le fichier. Absent si le nom ne change pas. */
  renommerEn?: string
  /** Apres ecriture : le fichier a ete renomme, donc son uri a change. */
  renomme?: { nom: string; uri?: string; error?: string }
  track?: LibraryTrack
  /** Explication quand matched vaut false. */
  message?: string
  /** Echec du traitement — arrive en HTTP 200 avec ok: false. */
  error?: string
  [k: string]: any
}

/**
 * Identifie une piste FilePlayer et écrit ses tags + pochette.
 * @param dryRun    true = identifie sans écrire (aperçu)
 * @param overwrite true = remplace les tags existants ; sinon complète les manquants
 * @param cover     intègre la pochette (défaut true)
 * @param rename    renomme le fichier d'après le titre trouvé (défaut true côté serveur)
 * @param mbid      enregistrement choisi dans /enrich/recherche
 *
 * ⚠️ `dryRun` vaut **false** côté serveur : sans lui, l'appel écrit et renomme.
 * ⚠️ Un échec revient en HTTP 200 avec `ok: false` — tester `ok`, pas le statut.
 */
export async function enrichTrack(
  ref: { uri?: string; id?: string; title?: string; artist?: string },
  opts: { dryRun?: boolean; overwrite?: boolean; cover?: boolean; rename?: boolean; mbid?: string } = {}
): Promise<EnrichResult> {
  return unwrap(await http.post('/library/enrich', {
    ...(ref.uri ? { uri: ref.uri } : { id: ref.id }),
    ...(ref.title  ? { title: ref.title }   : {}),
    ...(ref.artist ? { artist: ref.artist } : {}),
    ...opts,
  }))
}

/** Un candidat de /enrich/recherche, du meilleur au moins bon. */
export interface EnrichCandidat {
  score: number
  title: string | null
  artist: string | null
  album: string | null
  date: string | null
  rec_mbid: string | null
  rg_mbid: string | null
}

/**
 * Recherche manuelle MusicBrainz : sert quand l'empreinte ne trouve rien, mais
 * aussi pour corriger une correspondance fausse malgre un bon score.
 * `artist` est facultatif et leve beaucoup d'ambiguite.
 *
 * MusicBrainz limite a ~1 requete/s : ne pas appeler a chaque frappe.
 */
export async function searchEnrich(title: string, artist?: string): Promise<EnrichCandidat[]> {
  const d = unwrap<{ ok?: boolean; candidats?: EnrichCandidat[] }>(
    await http.get('/library/enrich/recherche', { params: { title, artist: artist || undefined } })
  )
  return d?.candidats ?? []
}

/* ── Catégories (dossiers) ─────────────────────────────────────────────────── */

/** Dossiers (catégories) — agrège toutes les pages (le serveur plafonne à 50/page) */
export async function getCategories(opts: { sources?: LibrarySource[] } = {}): Promise<LibraryCategory[]> {
  return getAllPages<LibraryCategory>('/library/categories', { sources: srcParam(opts.sources) })
}

/** Pistes contenues dans un dossier (catégorie) d'une source (paginé) */
export async function getCategoryTracks(source: LibrarySource, id: string, opts: PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get(`/library/categories/${source}/${encodeURIComponent(id)}/tracks`, { params: pageParams(opts) }))
}

/* ── Playlists ─────────────────────────────────────────────────────────────── */

export async function getPlaylists(opts: { category?: string; q?: string; sources?: LibrarySource[] } = {}): Promise<LibraryPlaylist[]> {
  return getAllPages<LibraryPlaylist>('/library/playlists', { category: opts.category, q: opts.q, sources: srcParam(opts.sources) })
}

/** Pistes d'une playlist (paginé) */
export async function getPlaylistTracks(source: LibrarySource, id: string, opts: PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get(`/library/playlists/${source}/${encodeURIComponent(id)}/tracks`, { params: pageParams(opts) }))
}

/** Enfile toute la playlist dans le lecteur relié */
export async function enqueuePlaylist(source: LibrarySource, id: string, lecteurId?: number) {
  return http.post(`/library/playlists/${source}/${encodeURIComponent(id)}/enqueue`, lecteurId != null ? { lecteurId } : {})
}

/* ── Albums ────────────────────────────────────────────────────────────────── */

export async function getAlbums(opts: { q?: string; sources?: LibrarySource[] } = {}): Promise<LibraryAlbum[]> {
  return getAllPages<LibraryAlbum>('/library/albums', { q: opts.q, sources: srcParam(opts.sources) })
}

/** Pistes d'un album (paginé) */
export async function getAlbumTracks(source: LibrarySource, id: string, opts: PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get(`/library/albums/${source}/${encodeURIComponent(id)}/tracks`, { params: pageParams(opts) }))
}

/* ── Artistes ──────────────────────────────────────────────────────────────── */

export async function getArtists(opts: { q?: string; sources?: LibrarySource[] } = {}): Promise<LibraryArtist[]> {
  return getAllPages<LibraryArtist>('/library/artists', { q: opts.q, sources: srcParam(opts.sources) })
}

export async function getArtistAlbums(source: LibrarySource, id: string, opts: PageParams = {}): Promise<LibraryAlbum[]> {
  return listItems<LibraryAlbum>(await http.get(`/library/artists/${source}/${encodeURIComponent(id)}/albums`, { params: pageParams(opts) }))
}

/** Albums d'un artiste (paginé — pour « Charger plus ») */
export async function getArtistAlbumsPage(source: LibrarySource, id: string, opts: PageParams = {}): Promise<Page<LibraryAlbum>> {
  return unpage<LibraryAlbum>(await http.get(`/library/artists/${source}/${encodeURIComponent(id)}/albums`, { params: pageParams(opts) }))
}

/** Pistes d'un artiste (paginé — un artiste peut en avoir des centaines) */
export async function getArtistTracks(source: LibrarySource, id: string, opts: PageParams = {}): Promise<Page<LibraryTrack>> {
  return unpage<LibraryTrack>(await http.get(`/library/artists/${source}/${encodeURIComponent(id)}/tracks`, { params: pageParams(opts) }))
}
