<script setup lang="ts">
import Lecture        from '@/components/spotify/components/lecture.vue'
import LibrarySidebar from '@/components/spotify/components/LibrarySidebar.vue'
import HomeView       from '@/components/spotify/components/HomeView.vue'
import ItemPlaylist   from '@/components/spotify/components/ItemPlaylist.vue'
import ItemAlbum      from '@/components/spotify/components/ItemAlbum.vue'
import ItemArtist     from '@/components/spotify/components/ItemArtist.vue'
import DbPlaylistDetail from '@/components/spotify/components/DbPlaylistDetail.vue'
import SavedDetail from '@/components/spotify/components/SavedDetail.vue'
import TrackListView from '@/components/spotify/components/TrackListView.vue'
import { useEventListener } from '@vueuse/core'
import {
  getDbPlaylists, createDbPlaylist, addDbPlaylistTrack, playDbPlaylist, type DbPlaylist
} from '@/src/api/dbPlaylists'
import { addSavedTrack, removeSavedTrack, addSavedArtist } from '@/src/api/saved'
import {
  getPlaylistTracks, getAlbumTracks, getArtistTracks, getArtistAlbumsPage, getProviders,
  getCategoryTracks, getTrackliste, getLikedByArtist, enrichTrack, resolveCoverUrl,
  enqueueTrack, play, resolveId, sourceKey, type PlayType,
  type LibrarySource, type LibraryTrack, type LibraryProvider,
  type LibraryPlaylist, type LibraryAlbum, type LibraryArtist, type LibraryCategory,
  type EnrichResult, type Page
} from '@/src/api/library'
import {
  mapPlaylistDetail, mapAlbumDetail, mapArtistDetail, mapArtistAlbum, mapTrack
} from '@/components/spotify/composable/useLibraryMappers'
import { getLecteurs, type Lecteur } from '@/src/api/lecteur'
import {
  getGenres, getGenreTracks, createGenre, updateGenre, deleteGenre as apiDeleteGenre,
  addGenreTrack, removeGenreTrack, type Genre
} from '@/src/api/genres'
import { useLibrarySources } from '@/composables/useLibrarySources'

const toast = useToast()
const { activeLecteurId } = useDashboard()
const { sources: librarySources } = useLibrarySources()
const playerHeight = 104
const sidebarOpen  = ref(false)

/* Monté côté client (remplace <ClientOnly> qui ne re-rend pas le lecteur
   après une navigation SPA → le lecteur disparaissait au retour sur Musique) */
const isMounted = ref(false)

/* Piste en cours (lecteur actif ou premier en lecture) → indicateur dans les listes */
const lecteursWs = useLecteursWs()
const nowPlayingKey = computed(() => {
  const list = lecteursWs.lecteurs.value
  const sel = activeLecteurId.value != null ? list.find(l => l.id === activeLecteurId.value) : null
  const l = sel ?? list.find(x => x.playing) ?? null
  const t: any = l?.track
  return t ? String(t.sourceId ?? t.uri ?? t.title ?? '') : ''
})

/* ─── Sélection courante ─────────────────────────────────────────────────── */
type ViewType = 'home' | 'playlist' | 'album' | 'artist' | 'db' | 'saved' | 'tracks'
const viewType = ref<ViewType>('home')

/* Vue « liste de pistes » : dossier fileplayer (category) ou toute la trackliste */
const trackListTracks  = ref<LibraryTrack[]>([])
const trackListTitle   = ref('')
const trackListCover    = ref<string | null>(null)
const trackListEyebrow = ref('Pistes')
const trackListIcon    = ref('i-lucide-folder')
const trackListLoading = ref(false)
/* Si la liste affichée est un genre éditable → son id (sinon null = lecture seule) */
const trackListGenreId = ref<number | string | null>(null)
/* Pagination de la liste de pistes (Charger plus) */
const TRACK_PAGE_SIZE  = 100
const trackListPage    = ref(1)
const trackListHasMore = ref(false)
const trackListMore    = ref(false)   // chargement d'une page suivante en cours
let   trackListFetcher: ((page: number) => Promise<Page<LibraryTrack>>) | null = null

/** Charge la 1ʳᵉ page via le fetcher courant */
async function loadTrackListFirst() {
  if (!trackListFetcher) return
  trackListPage.value = 1
  trackListHasMore.value = false
  trackListLoading.value = true
  try {
    const res = await trackListFetcher(1)
    indexTracks(res.items)
    trackListTracks.value = res.items
    trackListHasMore.value = res.hasMore
  } catch { toast.add({ title: 'Chargement impossible', color: 'error' }) }
  finally { trackListLoading.value = false }
}
/** Charge la page suivante et l'ajoute à la liste */
async function loadMoreTracks() {
  if (!trackListFetcher || !trackListHasMore.value || trackListMore.value) return
  trackListMore.value = true
  try {
    const next = trackListPage.value + 1
    const res = await trackListFetcher(next)
    indexTracks(res.items)
    trackListTracks.value = [...trackListTracks.value, ...res.items]
    trackListPage.value = next
    trackListHasMore.value = res.hasMore
  } catch { toast.add({ title: 'Chargement impossible', color: 'error' }) }
  finally { trackListMore.value = false }
}

/* Pagination des pistes d'artiste (Top titres — Charger plus) */
const artistTracksPage    = ref(1)
const artistTracksHasMore = ref(false)
const artistTracksMore    = ref(false)
let   artistTracksFetcher: ((page: number) => Promise<Page<LibraryTrack>>) | null = null

/* Pagination de la discographie d'artiste (Albums — Charger plus) */
const artistAlbumsPage    = ref(1)
const artistAlbumsHasMore = ref(false)
const artistAlbumsMore    = ref(false)
const ARTIST_ALBUMS_SIZE  = 50

/* Onglet « Aimés » d'un artiste (source paginée dédiée /library/like/:source) */
const artistLikedTracks  = ref<any[]>([])   // pistes mappées (forme ItemArtist)
const artistLikedPage    = ref(1)
const artistLikedHasMore = ref(false)
const artistLikedMore    = ref(false)

/** Chargée à la 1ʳᵉ ouverture de l'onglet Aimés (émis par ItemArtist) */
async function onRequestLikedArtist() {
  const ar = currentArtist.value
  if (!ar) return
  artistLikedPage.value = 1
  artistLikedTracks.value = []
  artistLikedHasMore.value = false
  artistLikedMore.value = true
  try {
    const res = await getLikedByArtist(ar.source, ar.name, { page: 1, pageSize: 50 })
    indexTracks(res.items)
    artistLikedTracks.value = res.items.map((t, i) => mapTrack(t, i))
    artistLikedHasMore.value = res.hasMore
  } catch { toast.add({ title: 'Titres aimés indisponibles', color: 'error' }) }
  finally { artistLikedMore.value = false }
}
async function loadMoreLikedArtist() {
  const ar = currentArtist.value
  if (!ar || !artistLikedHasMore.value || artistLikedMore.value) return
  artistLikedMore.value = true
  try {
    const next = artistLikedPage.value + 1
    const res = await getLikedByArtist(ar.source, ar.name, { page: next, pageSize: 50 })
    indexTracks(res.items)
    const base = artistLikedTracks.value.length
    artistLikedTracks.value = [...artistLikedTracks.value, ...res.items.map((t, i) => mapTrack(t, base + i))]
    artistLikedPage.value = next
    artistLikedHasMore.value = res.hasMore
  } catch { toast.add({ title: 'Chargement impossible', color: 'error' }) }
  finally { artistLikedMore.value = false }
}

/** Lit les titres aimés de l'artiste (1ʳᵉ piste puis enfile le reste) */
function playLikedArtist() {
  const raw = artistLikedTracks.value.map((t: any) => t.__src as LibraryTrack).filter(Boolean)
  const first = raw[0]
  if (!first) { toast.add({ title: 'Aucun titre aimé', color: 'warning' }); return }
  const source = (currentArtist.value?.source ?? first.source) as LibrarySource
  requestPlay({
    source, type: 'track', title: `${currentArtist.value?.name ?? ''} · Aimés`,
    run: async (lecteurId) => {
      await play({ source: first.source, type: 'track', uri: first.uri ?? '', lecteurId })
      for (const t of raw.slice(1)) await enqueueTrack(t, lecteurId)
    }
  })
}

/* Pagination des pistes de détail playlist / album (Charger plus) */
const detailTracksPage    = ref(1)
const detailTracksHasMore = ref(false)
const detailTracksMore    = ref(false)
let   detailTracksFetcher: ((page: number) => Promise<Page<LibraryTrack>>) | null = null
let   detailTracksAppend:  ((items: LibraryTrack[]) => void) | null = null

async function loadMoreDetailTracks() {
  if (!detailTracksFetcher || !detailTracksAppend || !detailTracksHasMore.value || detailTracksMore.value) return
  detailTracksMore.value = true
  try {
    const next = detailTracksPage.value + 1
    const res = await detailTracksFetcher(next)
    indexTracks(res.items)
    detailTracksAppend(res.items)
    detailTracksPage.value = next
    detailTracksHasMore.value = res.hasMore
  } catch { toast.add({ title: 'Chargement impossible', color: 'error' }) }
  finally { detailTracksMore.value = false }
}

/* Playlist perso (DB) sélectionnée */
const dbPlaylistId = ref<number | string | null>(null)
/* Vue « saved » : titres aimés / artistes suivis */
const savedKind = ref<'tracks' | 'artists'>('tracks')
function openSaved(kind: 'tracks' | 'artists') {
  navGo({ label: kind === 'tracks' ? 'Titres aimés' : 'Artistes suivis', run: () => openSaved(kind) })
  clearAll(); savedKind.value = kind; viewType.value = 'saved'
}
const sidebarRef   = ref<any>(null)
const sidebarRefMobile = ref<any>(null)
function reloadSidebarDb() {
  sidebarRef.value?.reloadDb?.()
  sidebarRefMobile.value?.reloadDb?.()
}

const loading = ref(false)
const error   = ref<string | null>(null)

/* Détails mappés (forme Spotify pour les Item*) */
const playlistDetail = ref<any>(null)
const albumDetail    = ref<any>(null)
const artistDetail   = ref<any>(null)
const currentArtist  = ref<LibraryArtist | null>(null)  // objet original (pour le suivi)

/* Index uri → LibraryTrack original (pour l'enqueue depuis les Item*) */
let trackByUri = new Map<string, LibraryTrack>()
/* Contexte de la sélection courante (pour enqueuePlaylist) */
const currentCtx = ref<{ source: LibrarySource; id: string; lecteurId?: number } | null>(null)

/** Lecteur cible : sélection manuelle, sinon celui renvoyé par l'API */
const targetLecteur = computed(() => activeLecteurId.value ?? currentCtx.value?.lecteurId ?? undefined)

const contentKey = computed(() => {
  if (viewType.value === 'playlist') return `pl:${currentCtx.value?.id}`
  if (viewType.value === 'album')    return `al:${currentCtx.value?.id}`
  if (viewType.value === 'artist')   return `ar:${currentCtx.value?.id}`
  if (viewType.value === 'db')       return `db:${dbPlaylistId.value}`
  if (viewType.value === 'tracks')   return `tracks:${trackListTitle.value}`
  return 'home'
})
const currentName = computed(() =>
  viewType.value === 'playlist' ? playlistDetail.value?.name :
  viewType.value === 'album'    ? albumDetail.value?.name :
  viewType.value === 'artist'   ? artistDetail.value?.name :
  viewType.value === 'tracks'   ? trackListTitle.value : ''
)
const currentCover = computed(() =>
  viewType.value === 'playlist' ? playlistDetail.value?.images?.[0]?.url :
  viewType.value === 'album'    ? albumDetail.value?.images?.[0]?.url :
  viewType.value === 'artist'   ? artistDetail.value?.images?.[0]?.url :
  viewType.value === 'tracks'   ? trackListCover.value : null
)

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function clearAll() {
  playlistDetail.value = null
  albumDetail.value    = null
  artistDetail.value   = null
  currentArtist.value  = null
  dbPlaylistId.value   = null
  currentCtx.value     = null
  trackListTracks.value = []
  trackListTitle.value  = ''
  trackListCover.value  = null
  trackListGenreId.value = null
  trackListFetcher = null
  trackListHasMore.value = false
  trackListPage.value = 1
  artistTracksFetcher = null
  artistTracksHasMore.value = false
  artistTracksPage.value = 1
  artistLikedTracks.value = []
  artistLikedHasMore.value = false
  artistLikedPage.value = 1
  detailTracksFetcher = null
  detailTracksAppend = null
  detailTracksHasMore.value = false
  detailTracksPage.value = 1
  trackByUri = new Map()
}
function clearSelection() {
  clearAll(); viewType.value = 'home'
  navStack.value = []; navCurrent = null      // retour accueil → historique vidé
}

/* ─── Historique de navigation (ex. album → retour sur l'artiste) ─────────── */
type NavEntry = { label: string; run: () => void }
const navStack = ref<NavEntry[]>([])
let navCurrent: NavEntry | null = null
let navBacking = false                        // vrai pendant un « Retour » (n'empile pas)

/** Appelé par chaque ouverture de vue : empile la vue précédente */
function navGo(entry: NavEntry) {
  if (navBacking) navBacking = false
  else if (navCurrent) navStack.value = [...navStack.value, navCurrent]
  navCurrent = entry
}

const canGoBack = computed(() => navStack.value.length > 0)
const backLabel = computed(() => navStack.value[navStack.value.length - 1]?.label ?? '')

/** Retour : rouvre la vue précédente (ou l'accueil si l'historique est vide) */
function goBack() {
  const prev = navStack.value[navStack.value.length - 1]
  if (!prev) { clearSelection(); return }
  navStack.value = navStack.value.slice(0, -1)
  navBacking = true
  navCurrent = null
  prev.run()
}

/* Ouverture d'une playlist perso (DB) */
function openDbPlaylist(p: DbPlaylist) {
  navGo({ label: p.name || 'Collection', run: () => openDbPlaylist(p) })
  clearAll()
  viewType.value = 'db'
  dbPlaylistId.value = p.id
}

function indexTracks(tracks: LibraryTrack[]) {
  for (const t of tracks) {
    const uri = String(t.uri ?? t.id ?? '')
    if (uri) trackByUri.set(uri, t)
  }
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && viewType.value !== 'home') clearSelection()
})

/** Détecte une collection DB (playlist/album perso) — source marqueur ou champ kind */
function isDbCollection(item: any): boolean {
  return item?.source === 'playlist' || item?.kind === 'playlist' || item?.kind === 'album'
}

/* ─── Ouvertures ─────────────────────────────────────────────────────────── */
async function openPlaylist(p: LibraryPlaylist) {
  // Collection DB → vue dédiée db-playlists
  if (isDbCollection(p)) { openDbPlaylist({ id: p.id, name: p.name } as DbPlaylist); return }
  navGo({ label: p.name || 'Playlist', run: () => openPlaylist(p) })
  clearAll()
  viewType.value = 'playlist'
  currentCtx.value = { source: p.source, id: p.id, lecteurId: (p as any).lecteurId }
  loading.value = true; error.value = null
  // En-tête visible immédiatement (même si les pistes échouent)
  playlistDetail.value = mapPlaylistDetail(p, [])
  detailTracksFetcher = (page) => getPlaylistTracks(p.source, p.id, { page, pageSize: 100 })
  detailTracksAppend = (items) => {
    if (!playlistDetail.value) return
    const base = playlistDetail.value.tracks.items.length
    const mapped = items.map((t, i) => ({ track: mapTrack(t, base + i) }))
    playlistDetail.value.tracks.items = [...playlistDetail.value.tracks.items, ...mapped]
  }
  try {
    const res = await detailTracksFetcher(1)
    detailTracksPage.value = 1
    detailTracksHasMore.value = res.hasMore
    indexTracks(res.items)
    playlistDetail.value = mapPlaylistDetail(p, res.items)
    playlistDetail.value.tracks.total = res.total
  } catch (e: any) {
    const status = e?.response?.status
    error.value = status === 403
      ? 'Playlist non accessible via l\'API Spotify (playlist éditoriale ou algorithmique : Discover Weekly, Radar des sorties, Daily Mix…).'
      : (e?.message || 'Chargement impossible')
  } finally { loading.value = false }
}

async function openAlbum(a: LibraryAlbum) {
  // Album DB (collection perso) → vue dédiée db-playlists
  if (isDbCollection(a)) { openDbPlaylist({ id: a.id, name: a.name } as DbPlaylist); return }
  const id = sourceKey(a)   // sourceId natif, pas l'id DB
  if (!id) { toast.add({ title: 'Album sans identifiant', color: 'error' }); return }
  navGo({ label: a.name || 'Album', run: () => openAlbum(a) })
  clearAll()
  viewType.value = 'album'
  currentCtx.value = { source: a.source, id, lecteurId: (a as any).lecteurId }
  loading.value = true; error.value = null
  // En-tête visible immédiatement
  albumDetail.value = mapAlbumDetail({ ...a, id }, [])
  detailTracksFetcher = (page) => getAlbumTracks(a.source, id, { page, pageSize: 100 })
  detailTracksAppend = (items) => {
    if (!albumDetail.value) return
    const base = albumDetail.value.tracks.items.length
    const mapped = items.map((t, i) => mapTrack(t, base + i))
    albumDetail.value.tracks.items = [...albumDetail.value.tracks.items, ...mapped]
  }
  try {
    const res = await detailTracksFetcher(1)
    detailTracksPage.value = 1
    detailTracksHasMore.value = res.hasMore
    indexTracks(res.items)
    albumDetail.value = mapAlbumDetail({ ...a, id }, res.items)
    albumDetail.value.tracks.total = res.total
  } catch (e: any) { error.value = e?.message || 'Chargement des pistes impossible' }
  finally { loading.value = false }
}

async function openArtist(ar: LibraryArtist) {
  const id = sourceKey(ar)   // channelId / sourceId, pas l'id DB
  if (!id) { toast.add({ title: 'Artiste sans identifiant', color: 'error' }); return }
  navGo({ label: ar.name || 'Artiste', run: () => openArtist(ar) })
  clearAll()
  currentArtist.value = ar
  viewType.value = 'artist'
  currentCtx.value = { source: ar.source, id, lecteurId: (ar as any).lecteurId }
  loading.value = true; error.value = null
  // En-tête visible immédiatement
  artistDetail.value = mapArtistDetail(ar, [], [])
  const emptyPage: Page<LibraryTrack> = { items: [], total: 0, page: 1, pageSize: 50, hasMore: false }
  artistTracksFetcher = (page) => getArtistTracks(ar.source, id, { page, pageSize: 50 })
  try {
    const emptyAlbums: Page<LibraryAlbum> = { items: [], total: 0, page: 1, pageSize: ARTIST_ALBUMS_SIZE, hasMore: false }
    const [tracksPage, albumsPage] = await Promise.all([
      artistTracksFetcher(1).catch(() => emptyPage),
      getArtistAlbumsPage(ar.source, id, { page: 1, pageSize: ARTIST_ALBUMS_SIZE }).catch(() => emptyAlbums)
    ])
    artistTracksPage.value = 1
    artistTracksHasMore.value = tracksPage.hasMore
    artistAlbumsPage.value = 1
    artistAlbumsHasMore.value = albumsPage.hasMore
    indexTracks(tracksPage.items)
    artistDetail.value = mapArtistDetail(ar, tracksPage.items, albumsPage.items)
  } catch (e: any) { error.value = e?.message || 'Chargement impossible' }
  finally { loading.value = false }
  // Précharge les titres aimés de l'artiste (compte visible direct, bascule instantanée)
  onRequestLikedArtist()
}

/** Charge la page suivante des pistes d'artiste et l'ajoute aux Top titres */
async function loadMoreArtistTracks() {
  if (!artistTracksFetcher || !artistTracksHasMore.value || artistTracksMore.value) return
  artistTracksMore.value = true
  try {
    const next = artistTracksPage.value + 1
    const res = await artistTracksFetcher(next)
    indexTracks(res.items)
    const base = artistDetail.value?.topTracks?.length ?? 0
    const mapped = res.items.map((t, i) => mapTrack(t, base + i))
    if (artistDetail.value) artistDetail.value.topTracks = [...(artistDetail.value.topTracks ?? []), ...mapped]
    artistTracksPage.value = next
    artistTracksHasMore.value = res.hasMore
  } catch { toast.add({ title: 'Chargement impossible', color: 'error' }) }
  finally { artistTracksMore.value = false }
}

/** Charge la page suivante des albums de l'artiste (discographie) */
async function loadMoreArtistAlbums() {
  const ar = currentArtist.value
  const id = ar ? sourceKey(ar) : ''
  if (!ar || !id || !artistAlbumsHasMore.value || artistAlbumsMore.value) return
  artistAlbumsMore.value = true
  try {
    const next = artistAlbumsPage.value + 1
    const res = await getArtistAlbumsPage(ar.source, id, { page: next, pageSize: ARTIST_ALBUMS_SIZE })
    if (artistDetail.value) {
      artistDetail.value.albums = [...(artistDetail.value.albums ?? []), ...res.items.map(mapArtistAlbum)]
    }
    artistAlbumsPage.value = next
    artistAlbumsHasMore.value = res.hasMore
  } catch { toast.add({ title: 'Chargement des albums impossible', color: 'error' }) }
  finally { artistAlbumsMore.value = false }
}

/* ─── Liste de pistes (dossier fileplayer / toute la trackliste) ──────────── */
async function openCategory(cat: LibraryCategory) {
  navGo({ label: cat.name || 'Dossier', run: () => openCategory(cat) })
  clearAll()
  viewType.value = 'tracks'
  trackListTitle.value = cat.name
  trackListEyebrow.value = 'Dossier'
  trackListIcon.value = 'i-lucide-folder'
  trackListCover.value = (cat as any).coverUrl ?? cat.cover_url ?? null
  currentCtx.value = { source: cat.source as LibrarySource, id: resolveId(cat as any) }
  const src = cat.source as LibrarySource, cid = resolveId(cat as any)
  trackListFetcher = (page) => getCategoryTracks(src, cid, { page, pageSize: TRACK_PAGE_SIZE })
  await loadTrackListFirst()
}

async function openGenre(g: Genre) {
  navGo({ label: g.name || 'Catégorie', run: () => openGenre(g) })
  clearAll()
  viewType.value = 'tracks'
  trackListTitle.value = g.name
  trackListEyebrow.value = 'Catégorie'
  trackListIcon.value = 'i-lucide-tag'
  trackListCover.value = (g as any).coverUrl ?? (g as any).cover_url ?? null
  trackListGenreId.value = g.id
  trackListFetcher = (page) => getGenreTracks(g.name, { page, pageSize: TRACK_PAGE_SIZE })
  await loadTrackListFirst()
}

/* ── Édition d'un genre (renommer / pochette / supprimer / retirer une piste) ── */
async function renameGenre(name: string) {
  const id = trackListGenreId.value
  if (id == null) return
  try { await updateGenre(id, { name }); trackListTitle.value = name }
  catch { toast.add({ title: 'Renommage impossible', color: 'error' }) }
}
async function setGenreCover(url: string) {
  const id = trackListGenreId.value
  if (id == null) return
  try { await updateGenre(id, { coverUrl: url }); trackListCover.value = url || null }
  catch { toast.add({ title: 'Pochette impossible', color: 'error' }) }
}
async function deleteGenre() {
  const id = trackListGenreId.value
  if (id == null) return
  try { await apiDeleteGenre(id); toast.add({ title: 'Genre supprimé', color: 'success' }); clearSelection() }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
}
async function removeTrackFromGenre(t: LibraryTrack) {
  const tid = (t as any).id ?? (t as any).trackId ?? (t as any).sourceId
  try {
    await removeGenreTrack(trackListTitle.value, tid)
    trackListTracks.value = trackListTracks.value.filter(x => x !== t)
  } catch { toast.add({ title: 'Retrait impossible', color: 'error' }) }
}

/* ─── Enrichissement métadonnées FilePlayer (aperçu → écriture) ───────────── */
const enrichOpen      = ref(false)
const enrichTrackRef  = ref<LibraryTrack | null>(null)   // mode unitaire
const enrichBatch     = ref<LibraryTrack[]>([])          // mode lot
const enrichPreview   = ref<EnrichResult | null>(null)
const enrichOverwrite = ref(false)
const enrichCover     = ref(true)
const enrichLoading   = ref(false)   // dryRun en cours
const enrichWriting   = ref(false)   // écriture en cours
const enrichProgress  = ref(0)
const enrichIsBatch   = computed(() => enrichBatch.value.length > 0)
const enrichCoverUrl  = computed(() => resolveCoverUrl(enrichPreview.value?.cover ?? null))

/** Référence d'identité d'une piste (uri prioritaire, sinon sourceId/id) */
function trackRef(t: LibraryTrack): { uri?: string; id?: string; title?: string; artist?: string } {
  const base = t.uri ? { uri: t.uri } : { id: String((t as any).sourceId ?? (t as any).id ?? '') }
  // Indices d'identification : tags actuels de la piste (améliorent le matching)
  const artist = Array.isArray(t.artists) ? t.artists[0] : (t as any).artist
  return { ...base, ...(t.title ? { title: t.title } : {}), ...(artist ? { artist } : {}) }
}

async function onEnrichTrack(t: LibraryTrack) {
  enrichBatch.value = []
  enrichTrackRef.value = t
  enrichPreview.value = null
  enrichOverwrite.value = false
  enrichCover.value = true
  enrichOpen.value = true
  enrichLoading.value = true
  try {
    enrichPreview.value = await enrichTrack(trackRef(t), { dryRun: true, cover: true })
  } catch { toast.add({ title: 'Identification impossible', color: 'error' }) }
  finally { enrichLoading.value = false }
}

function onEnrichAll() {
  const fp = trackListTracks.value.filter(t => (t.source ?? '').toLowerCase() === 'fileplayer')
  if (!fp.length) { toast.add({ title: 'Aucune piste FilePlayer', color: 'warning' }); return }
  enrichTrackRef.value = null
  enrichPreview.value = null
  enrichBatch.value = fp
  enrichOverwrite.value = false
  enrichCover.value = true
  enrichProgress.value = 0
  enrichOpen.value = true
}

/** Reporte le résultat d'enrichissement sur l'objet piste (titre/artiste/album/cover) */
function applyEnrich(t: LibraryTrack, res: EnrichResult) {
  const src: any = res.track ?? res.found
  if (src) {
    if (src.title)   (t as any).title   = src.title
    if (src.artists) (t as any).artists = src.artists
    else if (src.artist) (t as any).artists = [src.artist]
    if (src.album)   (t as any).album   = src.album
  }
  if (res.cover) { (t as any).coverUrl = res.cover; (t as any).cover_url = res.cover }
}

async function confirmEnrich() {
  if (enrichWriting.value) return                     // garde anti double-clic
  const opts = { overwrite: enrichOverwrite.value, cover: enrichCover.value }
  enrichWriting.value = true
  try {
    if (enrichIsBatch.value) {
      const batch = enrichBatch.value
      let ok = 0
      for (const t of batch) {
        try { const res = await enrichTrack(trackRef(t), opts); if (res?.ok) { applyEnrich(t, res); ok++ } } catch { /* on continue */ }
        enrichProgress.value++
      }
      enrichOpen.value = false
      toast.add({ title: `Enrichi : ${ok}/${batch.length}`, color: 'success', icon: 'i-lucide-wand-sparkles' })
    } else if (enrichTrackRef.value) {
      const t = enrichTrackRef.value
      const res = await enrichTrack(trackRef(t), opts)
      // Fermer, laisser le modal se démonter, PUIS muter la piste (évite le re-render pendant la fermeture)
      enrichOpen.value = false
      await nextTick()
      applyEnrich(t, res)
      toast.add({
        title: res?.matched ? 'Piste enrichie' : 'Aucune correspondance fiable',
        description: res?.found?.title, color: res?.matched ? 'success' : 'warning', icon: 'i-lucide-wand-sparkles'
      })
    } else {
      enrichOpen.value = false
    }
  } catch { toast.add({ title: 'Enrichissement impossible', color: 'error' }) }
  finally { enrichWriting.value = false }
}

async function openTrackliste() {
  navGo({ label: 'Tous les titres', run: () => openTrackliste() })
  clearAll()
  viewType.value = 'tracks'
  trackListTitle.value = 'Tous les titres'
  trackListEyebrow.value = 'Bibliothèque'
  trackListIcon.value = 'i-lucide-music-4'
  const srcs = librarySources.value.length ? [...librarySources.value] : undefined
  trackListFetcher = (page) => getTrackliste({ sources: srcs, page, pageSize: TRACK_PAGE_SIZE })
  await loadTrackListFirst()
}

/* ─── ▶ Lire toute la liste (dossier / trackliste) ────────────────────────── */
function playAllTracks() {
  const tracks = trackListTracks.value
  const first = tracks[0]
  if (!first) return
  const source = (currentCtx.value?.source ?? first.source) as LibrarySource
  requestPlay({
    source, type: 'track', title: trackListTitle.value,
    run: async (lecteurId) => {
      // Lire la 1ʳᵉ piste (remplace la file) puis enfiler le reste dans l'ordre
      await play({ source: first.source, type: 'track', uri: first.uri ?? '', lecteurId })
      for (const t of tracks.slice(1)) await enqueueTrack(t, lecteurId)
    }
  })
}

/* Navigation interne album↔artiste : on n'a que des id → reconstruire un objet minimal */
function openAlbumById(source: LibrarySource, id: string) {
  openAlbum({ source, id, name: '' } as LibraryAlbum)
}
function openArtistById(source: LibrarySource, id: string) {
  openArtist({ source, id, name: '' } as LibraryArtist)
}

/* ─── ＋ Ajouter à la file (POST /library/enqueue { track }) ──────────────── */
async function doEnqueueTrack(t: LibraryTrack) {
  try {
    await enqueueTrack(t, targetLecteur.value)
    toast.add({ title: 'Ajouté à la file', description: t.title, color: 'success', icon: 'i-lucide-list-plus' })
  } catch { toast.add({ title: 'Ajout impossible', color: 'error' }) }
}

/* ─── ⤓ Télécharger une piste YouTube (Lecteur.Download) ───────────────────── */
function onDownloadTrack(t: any) {
  const videoId = youtubeVideoId(t)
  if (!videoId) { toast.add({ title: 'Identifiant vidéo introuvable', color: 'error' }); return }
  // Cible un lecteur YouTube : provider.lecteurId, sinon un lecteur live de type youtube
  const id = lecteurIdsFor('youtube')[0]
    ?? lecteursWs.lecteurs.value.find(l => (l.type ?? '').toLowerCase() === 'youtube')?.id
  if (id == null) { toast.add({ title: 'Aucun lecteur YouTube', color: 'warning' }); return }
  lecteursWs.download(id, videoId)
  toast.add({ title: 'Téléchargement lancé', description: t.title ?? t.name, color: 'success', icon: 'i-lucide-download' })
}

/* ─── ▶ Lire : sélection du lecteur selon le provider de la source ─────────── */
const lecteurs  = ref<Lecteur[]>([])
const providers = ref<LibraryProvider[]>([])
async function loadLecteurs() {
  try { lecteurs.value = await getLecteurs() } catch { /* noop */ }
  try { providers.value = await getProviders() } catch { /* noop */ }
}

/** Liste des ids de lecteurs rattachés à une source (provider.lecteurId, normalisé en tableau) */
function lecteurIdsFor(source: LibrarySource): number[] {
  const p = providers.value.find(p => (p.source ?? p.id) === source)
  const raw = p?.lecteurId
  return Array.isArray(raw) ? raw : raw != null ? [raw] : []
}

type PendingPlay = {
  source: LibrarySource; type: PlayType; id?: string; uri?: string; title?: string
  /** Exécuteur custom (sinon /library/play par défaut) — reçoit le lecteur choisi */
  run?: (lecteurId: number) => Promise<any>
}
const pendingPlay     = ref<PendingPlay | null>(null)
const candidateIds    = ref<number[]>([])
const playChooserOpen = ref(false)

/** Lecteurs candidats (résolus depuis les ids du provider) */
const compatibleLecteurs = computed(() =>
  candidateIds.value.map(id => lecteurs.value.find(l => l.id === id) ?? ({ id, name: `Lecteur #${id}`, type: pendingPlay.value?.source } as any))
)

/** Point d'entrée : propose les lecteurs du provider puis lance la lecture */
function requestPlay(args: PendingPlay) {
  let ids = lecteurIdsFor(args.source)
  // Repli : si le provider n'a rien (non chargé / source absente), déduire par type
  if (!ids.length) ids = lecteurs.value.filter(l => l.type === args.source).map(l => l.id)
  if (!ids.length) {
    toast.add({ title: `Aucun lecteur « ${args.source} »`, description: 'Aucun lecteur rattaché à cette source.', color: 'warning' })
    return
  }
  pendingPlay.value = args
  // Sélection manuelle (slideover) prioritaire si elle fait partie des candidats
  if (activeLecteurId.value && ids.includes(activeLecteurId.value)) { confirmPlay(activeLecteurId.value); return }
  if (ids.length === 1) { confirmPlay(ids[0]); return }   // un seul → direct
  candidateIds.value = ids
  playChooserOpen.value = true
}

async function confirmPlay(lecteurId: number) {
  const p = pendingPlay.value
  if (!p) return
  playChooserOpen.value = false
  try {
    if (p.run) await p.run(lecteurId)
    else await play({ source: p.source, type: p.type, id: p.id, uri: p.uri, lecteurId })
    toast.add({ title: 'Lecture lancée', description: p.title, color: 'success', icon: 'i-lucide-play' })
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || `HTTP ${e?.response?.status}`
    toast.add({ title: 'Lecture impossible', description: `${p.source}/${p.type} · ${msg}`, color: 'error' })
  }
  pendingPlay.value = null
}

function playContextCurrent(type: PlayType) {
  if (!currentCtx.value) return
  requestPlay({ source: currentCtx.value.source, type, id: currentCtx.value.id, title: currentName.value })
}

/** Lecture d'une playlist DB → sélecteur de lecteur basé sur la source de la playlist */
function onDbPlayAll(payload: { mode: 'replace' | 'add'; source?: string }) {
  const id = dbPlaylistId.value
  if (id == null) return
  const source = payload.source || 'playlist'
  requestPlay({
    source, type: 'playlist', id: String(id),
    run: (lecteurId) => playDbPlaylist(id, payload.mode, lecteurId),
  })
}

/** Reçoit un play-context depuis les cartes/sidebar : route DB vs library */
async function onPlayContext(p: { source: LibrarySource; type: PlayType; id: string; title?: string; kind?: string }) {
  // Collection DB (playlist/album perso) → endpoint dédié (le serveur cible le lecteur relié)
  if (isDbCollection(p)) {
    try {
      await playDbPlaylist(p.id, 'replace')
      toast.add({ title: 'Lecture lancée', description: p.title, color: 'success', icon: 'i-lucide-play' })
    } catch { toast.add({ title: 'Lecture impossible', color: 'error' }) }
    return
  }
  requestPlay(p)
}

/** Lit une piste précise (uri émis par ItemAlbum/ItemArtist) */
function playTrackByUri(uri: string) {
  const t = trackByUri.get(uri)
  if (!t) return
  requestPlay({ source: t.source, type: 'track', uri: t.uri ?? uri, title: t.title })
}

/** ItemPlaylist row → lit la piste à l'offset */
function onPlaylistRow(payload: { offset: number }) {
  const t = (playlistDetail.value?.tracks?.items?.[payload.offset]?.track)?.__src as LibraryTrack | undefined
  if (t?.uri) playTrackByUri(t.uri)
}

const lecteurIcon = (type?: string) => {
  switch ((type ?? '').toLowerCase()) {
    case 'spotify':    return 'mdi:spotify'
    case 'fileplayer': return 'mdi:file-music'
    case 'youtube':    return 'mdi:youtube'
    case 'deezer':     return 'i-simple-icons-deezer'
    default:           return 'i-lucide-music'
  }
}

/* ─── Ajouter une piste à une collection perso (playlist / album) ────────── */
const pickerOpen   = ref(false)
const pickerTrack  = ref<LibraryTrack | null>(null)
const pickerList   = ref<DbPlaylist[]>([])
const pickerGenres = ref<Genre[]>([])
const pickerNew    = ref('')
const pickerKind   = ref<'playlist' | 'album' | 'genre'>('playlist')
/**
 * Source de la collection = celle de la piste (verrouillée) pour playlist/album.
 * Mélanger les sources (ex. piste YouTube dans une collection Spotify) casse la
 * lecture sur le lecteur de la source. Les genres sont multi-sources → pas de verrou.
 */
const pickerSource = ref<LibrarySource>('')
const pickerSourceLabel = computed(() =>
  providers.value.find(p => (p.source ?? p.id) === pickerSource.value)?.name ?? pickerSource.value
)

/** Cibles existantes selon le type choisi (genre, ou collection DB filtrée par source) */
const filteredPickerList = computed<any[]>(() => {
  if (pickerKind.value === 'genre')
    return pickerGenres.value.map(g => ({ ...g, kind: 'genre' }))
  return pickerList.value.filter(p =>
    ((p as any).kind === 'album' ? 'album' : 'playlist') === pickerKind.value &&
    (!pickerSource.value || (p.source ?? '') === pickerSource.value)
  )
})

/* ─── Like / Follow ──────────────────────────────────────────────────────── */
/** Bascule aimé/non-aimé selon t.like (mise à jour optimiste de l'objet) */
async function onSaveTrack(t: LibraryTrack) {
  const liked = !!(t as any).like
  try {
    if (liked) {
      await removeSavedTrack(sourceKey(t))
      ;(t as any).like = false
      toast.add({ title: 'Retiré des titres aimés', description: t.title, color: 'neutral', icon: 'i-lucide-heart-off' })
    } else {
      await addSavedTrack(t)
      ;(t as any).like = true
      toast.add({ title: 'Titre aimé', description: t.title, color: 'success', icon: 'i-lucide-heart' })
    }
  } catch { toast.add({ title: 'Action impossible', color: 'error' }) }
}
async function onFollowArtist(a: LibraryArtist) {
  try {
    await addSavedArtist(a)
    toast.add({ title: 'Artiste suivi', description: a.name, color: 'success', icon: 'i-lucide-user-plus' })
  } catch { toast.add({ title: 'Suivi impossible', color: 'error' }) }
}

async function onAddToPlaylist(t: LibraryTrack) {
  pickerTrack.value = t
  pickerKind.value = 'playlist'
  pickerSource.value = (t.source ?? '') as LibrarySource   // défaut : source de la piste
  pickerOpen.value = true
  // Collections DB (playlists + albums avec `kind`) ET genres, en parallèle
  pickerList.value = []
  pickerGenres.value = []
  const [dbs, gens] = await Promise.all([getDbPlaylists().catch(() => []), getGenres().catch(() => [])])
  pickerList.value = dbs
  pickerGenres.value = gens
}
/** Ajoute la piste à la cible choisie (genre via name, collection DB via id) */
async function addToTarget(target: any) {
  if (!pickerTrack.value) return
  try {
    if (target.kind === 'genre') await addGenreTrack(target.name, pickerTrack.value)
    else                          await addDbPlaylistTrack(target.id, pickerTrack.value)
    const what = pickerKind.value === 'genre' ? 'au genre' : pickerKind.value === 'album' ? 'à l\'album' : 'à la playlist'
    toast.add({ title: `Ajouté ${what}`, description: pickerTrack.value.title, color: 'success', icon: 'i-lucide-folder-plus' })
    pickerOpen.value = false
    reloadSidebarDb()
  } catch { toast.add({ title: 'Ajout impossible', color: 'error' }) }
}
async function createAndAdd() {
  const name = pickerNew.value.trim()
  if (!name) return
  try {
    if (pickerKind.value === 'genre') {
      const g = await createGenre(name)
      pickerNew.value = ''
      await addToTarget({ kind: 'genre', name: g.name ?? name })
    } else {
      // La collection est créée dans la source choisie + le kind choisi
      const source = pickerSource.value || pickerTrack.value?.source
      const pl = await createDbPlaylist(name, source, pickerKind.value)
      pickerNew.value = ''
      await addToTarget({ kind: pickerKind.value, id: pl.id })
    }
  } catch { toast.add({ title: 'Création impossible', color: 'error' }) }
}

onMounted(() => { isMounted.value = true; loadLecteurs() })
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col">
    <div class="flex flex-1 min-h-0 overflow-hidden">

      <!-- SIDEBAR desktop -->
      <aside class="hidden md:block w-72 shrink-0 h-full">
        <LibrarySidebar
          ref="sidebarRef"
          :player-height="playerHeight"
          @select-playlist="openPlaylist"
          @select-album="openAlbum"
          @select-artist="openArtist"
          @select-db-playlist="openDbPlaylist"
          @open-saved="openSaved"
          @play-context="onPlayContext"
        />
      </aside>

      <!-- SIDEBAR mobile -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="sidebarOpen" class="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" @click="sidebarOpen = false" />
        </Transition>
        <div class="md:hidden fixed left-0 top-0 bottom-0 z-50 w-72 transition-transform duration-200" :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'">
          <LibrarySidebar
            ref="sidebarRefMobile"
            :player-height="playerHeight"
            @select-playlist="(p) => { openPlaylist(p); sidebarOpen = false }"
            @select-album="(a) => { openAlbum(a); sidebarOpen = false }"
            @select-artist="(ar) => { openArtist(ar); sidebarOpen = false }"
            @select-db-playlist="(p) => { openDbPlaylist(p); sidebarOpen = false }"
            @open-saved="(k) => { openSaved(k); sidebarOpen = false }"
            @play-context="onPlayContext"
          />
        </div>
      </Teleport>

      <!-- CONTENU -->
      <main class="flex-1 min-w-0 min-h-0 overflow-hidden">
        <div class="h-full overflow-y-auto w-full no-scrollbar">
          <Transition name="fade" mode="out-in">
            <div :key="contentKey" class="h-full">

              <!-- Détail -->
              <div v-if="viewType !== 'home'" class="flex flex-col min-h-full px-2 pb-3">
                <!-- Breadcrumb -->
                <div class="sticky top-0 z-20 bg-elevated/60 backdrop-blur py-2 mb-3 flex items-center gap-2">
                  <UButton class="md:hidden" icon="i-lucide-library" variant="ghost" size="sm" @click="sidebarOpen = true" />
                  <UTooltip :text="canGoBack ? `Retour : ${backLabel}` : 'Retour à l\'accueil'">
                    <UButton icon="i-lucide-arrow-left" variant="ghost" size="sm" @click="goBack" />
                  </UTooltip>
                  <UButton v-if="canGoBack" icon="i-lucide-house" variant="ghost" size="sm" title="Accueil" @click="clearSelection" />
                  <img v-if="currentCover && viewType !== 'artist'" :src="currentCover" class="h-7 w-7 rounded object-cover" alt="" />
                  <img v-else-if="currentCover && viewType === 'artist'" :src="currentCover" class="h-7 w-7 rounded-full object-cover" alt="" />
                  <span class="text-sm font-medium truncate">{{ currentName }}</span>
                </div>

                <UAlert v-if="error" color="error" class="mb-3" :title="error" />

                <div v-else-if="loading" class="space-y-3">
                  <USkeleton class="h-36 w-full rounded-md" />
                  <USkeleton class="h-8 w-1/3" />
                  <USkeleton v-for="i in 6" :key="i" class="h-10 w-full" />
                </div>

                <ItemPlaylist
                  v-else-if="viewType === 'playlist' && playlistDetail"
                  :key="`pl:${currentCtx?.id}`"
                  :item="playlistDetail"
                  :player-height="playerHeight"
                  :has-more="detailTracksHasMore"
                  :loading-more="detailTracksMore"
                  :current-key="nowPlayingKey"
                  @play-in-context="onPlaylistRow"
                  @enqueue-all="() => playContextCurrent('playlist')"
                  @save-track="onSaveTrack"
                  @load-more="loadMoreDetailTracks"
                  @download-track="onDownloadTrack"
                />

                <ItemAlbum
                  v-else-if="viewType === 'album' && albumDetail"
                  :key="`al:${currentCtx?.id}`"
                  :item="albumDetail"
                  :player-height="playerHeight"
                  :has-more="detailTracksHasMore"
                  :loading-more="detailTracksMore"
                  :current-key="nowPlayingKey"
                  @play-track="playTrackByUri"
                  @enqueue-all="() => playContextCurrent('album')"
                  @select-artist="(id) => currentCtx && openArtistById(currentCtx.source, id)"
                  @load-more="loadMoreDetailTracks"
                  @download-track="onDownloadTrack"
                />

                <ItemArtist
                  v-else-if="viewType === 'artist' && artistDetail"
                  :key="`ar:${currentCtx?.id}`"
                  :item="artistDetail"
                  :player-height="playerHeight"
                  :has-more-tracks="artistTracksHasMore"
                  :loading-more-tracks="artistTracksMore"
                  :liked-tracks="artistLikedTracks"
                  :has-more-liked="artistLikedHasMore"
                  :loading-more-liked="artistLikedMore"
                  :has-more-albums="artistAlbumsHasMore"
                  :loading-more-albums="artistAlbumsMore"
                  :current-key="nowPlayingKey"
                  @play-track="playTrackByUri"
                  @play-all="() => playContextCurrent('artist')"
                  @play-liked="playLikedArtist"
                  @select-album="(id) => currentCtx && openAlbumById(currentCtx.source, id)"
                  @follow="() => currentArtist && onFollowArtist(currentArtist)"
                  @save-track="onSaveTrack"
                  @enqueue-track="doEnqueueTrack"
                  @add-to-playlist="onAddToPlaylist"
                  @download-track="onDownloadTrack"
                  @load-more-tracks="loadMoreArtistTracks"
                  @load-more-liked="loadMoreLikedArtist"
                  @load-more-albums="loadMoreArtistAlbums"
                />

                <DbPlaylistDetail
                  v-else-if="viewType === 'db' && dbPlaylistId != null"
                  :key="`db:${dbPlaylistId}`"
                  :id="dbPlaylistId"
                  :player-height="playerHeight"
                  :current-key="nowPlayingKey"
                  @deleted="() => { clearSelection(); reloadSidebarDb() }"
                  @changed="reloadSidebarDb"
                  @play-track="(t) => requestPlay({ source: t.source, type: 'track', uri: t.uri ?? '', title: t.title })"
                  @play-all="onDbPlayAll"
                  @download-track="onDownloadTrack"
                />

                <SavedDetail
                  v-else-if="viewType === 'saved'"
                  :key="`saved:${savedKind}`"
                  :kind="savedKind"
                  :player-height="playerHeight"
                  :current-key="nowPlayingKey"
                  @select-artist="openArtist"
                  @download-track="onDownloadTrack"
                />

                <TrackListView
                  v-else-if="viewType === 'tracks'"
                  :key="`tracks:${trackListTitle}`"
                  :title="trackListTitle"
                  :eyebrow="trackListEyebrow"
                  :icon="trackListIcon"
                  :cover="trackListCover"
                  :tracks="trackListTracks"
                  :loading="trackListLoading"
                  :editable="trackListGenreId != null"
                  :has-more="trackListHasMore"
                  :loading-more="trackListMore"
                  :current-key="nowPlayingKey"
                  :player-height="playerHeight"
                  @play-track="(t) => requestPlay({ source: t.source, type: 'track', uri: t.uri ?? '', title: t.title })"
                  @save-track="onSaveTrack"
                  @enqueue-track="doEnqueueTrack"
                  @add-to-playlist="onAddToPlaylist"
                  @play-all="playAllTracks"
                  @rename="renameGenre"
                  @set-cover="setGenreCover"
                  @delete="deleteGenre"
                  @remove-track="removeTrackFromGenre"
                  @enrich-track="onEnrichTrack"
                  @enrich-all="onEnrichAll"
                  @load-more="loadMoreTracks"
                  @download-track="onDownloadTrack"
                />

                <div v-else-if="!loading && !error" class="text-sm text-dimmed px-2">Aucune donnée disponible.</div>
              </div>

              <!-- Accueil -->
              <div v-else class="relative h-full">
                <UButton class="md:hidden absolute top-3 left-3 z-10 shadow" icon="i-lucide-library" color="neutral" variant="soft" size="sm" @click="sidebarOpen = true" />
                <HomeView
                  :current-key="nowPlayingKey"
                  @select-playlist="openPlaylist"
                  @select-album="openAlbum"
                  @select-artist="openArtist"
                  @enqueue-track="doEnqueueTrack"
                  @play-track="(t) => requestPlay({ source: t.source, type: 'track', uri: t.uri ?? '', title: t.title })"
                  @add-to-playlist="onAddToPlaylist"
                  @download-track="onDownloadTrack"
                  @save-track="onSaveTrack"
                  @follow-artist="onFollowArtist"
                  @play-context="onPlayContext"
                  @select-category="openCategory"
                  @select-genre="openGenre"
                  @open-trackliste="openTrackliste"
                />
              </div>
            </div>
          </Transition>
        </div>
      </main>
    </div>

    <!-- Sélecteur de lecteur (type compatible) -->
    <UModal v-model:open="playChooserOpen" :title="`Lire sur quel lecteur ?`">
      <template #content>
        <div class="p-4 space-y-3">
          <p class="text-sm text-dimmed">
            Lecteurs compatibles
            <UBadge :label="pendingPlay?.source" color="neutral" variant="subtle" size="xs" class="ml-1" />
          </p>
          <div class="space-y-1">
            <button
              v-for="l in compatibleLecteurs"
              :key="l.id"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-elevated/60 text-left transition-colors"
              @click="confirmPlay(l.id)"
            >
              <UIcon :name="lecteurIcon(l.type)" class="size-5 shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="truncate text-sm font-medium">{{ l.name || 'Sans nom' }}</p>
                <p class="text-xs text-dimmed">{{ l.type }}</p>
              </div>
              <UBadge
                :color="(l as any).isStart?.alive ? 'success' : 'neutral'"
                variant="subtle" size="xs"
              >{{ (l as any).isStart?.alive ? 'Actif' : 'Arrêté' }}</UBadge>
              <UIcon name="i-lucide-play" class="size-4 text-primary shrink-0" />
            </button>
          </div>
          <div class="flex justify-end pt-2">
            <UButton label="Annuler" color="neutral" variant="soft" @click="playChooserOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Ajouter à une collection perso (playlist / album) -->
    <UModal v-model:open="pickerOpen" title="Ajouter à une collection">
      <template #content>
        <div class="p-4 space-y-3">
          <p v-if="pickerTrack" class="text-sm text-dimmed truncate">
            <UIcon name="i-lucide-music" class="inline size-3.5 mr-1" />{{ pickerTrack.title }}
          </p>

          <!-- Source verrouillée (playlist/album) : celle de la piste. Pas pour les genres (multi-sources) -->
          <div v-if="pickerKind !== 'genre' && pickerSource" class="flex items-center gap-2 text-xs text-dimmed">
            <span class="shrink-0">Source</span>
            <UBadge :label="pickerSourceLabel" color="neutral" variant="subtle" size="sm" />
          </div>

          <!-- Créer + ajouter (avec choix du type) -->
          <div class="flex gap-2">
            <USelect
              v-model="pickerKind"
              :items="[{ label: 'Playlist', value: 'playlist' }, { label: 'Album', value: 'album' }, { label: 'Genre', value: 'genre' }]"
              class="w-28"
            />
            <UInput v-model="pickerNew" :placeholder="pickerKind === 'genre' ? 'Nouveau genre…' : pickerKind === 'album' ? 'Nouvel album…' : 'Nouvelle playlist…'" class="flex-1" @keyup.enter="createAndAdd" />
            <UButton icon="i-lucide-plus" color="primary" :disabled="!pickerNew.trim()" @click="createAndAdd">Créer</UButton>
          </div>

          <USeparator label="ou choisir" />

          <div v-if="!filteredPickerList.length" class="text-sm text-dimmed text-center py-4">
            Aucun{{ pickerKind === 'album' ? ' album' : pickerKind === 'genre' ? ' genre' : 'e playlist' }} pour l'instant.
          </div>
          <div v-else class="space-y-1 max-h-72 overflow-y-auto">
            <button
              v-for="p in filteredPickerList"
              :key="p.kind + ':' + p.id"
              class="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-elevated/50 text-left"
              @click="addToTarget(p)"
            >
              <div class="h-9 w-9 rounded bg-elevated flex items-center justify-center shrink-0">
                <UIcon :name="p.kind === 'genre' ? 'i-lucide-tag' : p.kind === 'album' ? 'i-lucide-disc-3' : 'i-lucide-list-music'" class="size-4 text-dimmed" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ p.name }}</p>
                <p class="text-xs text-dimmed">
                  {{ p.kind === 'genre' ? 'Genre' : p.kind === 'album' ? 'Album' : 'Playlist' }} · {{ p.trackCount ?? p.tracks?.length ?? 0 }} titres
                </p>
              </div>
              <UIcon name="i-lucide-plus" class="size-4 text-primary shrink-0" />
            </button>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Enrichissement métadonnées FilePlayer -->
    <UModal v-model:open="enrichOpen" :title="enrichIsBatch ? 'Enrichir les pistes FilePlayer' : 'Enrichir la piste'">
      <template #content>
        <div class="p-4 space-y-4">
          <!-- Mode lot -->
          <template v-if="enrichIsBatch">
            <p class="text-sm">
              <UIcon name="i-lucide-wand-sparkles" class="inline size-4 mr-1 text-primary" />
              {{ enrichBatch.length }} piste{{ enrichBatch.length !== 1 ? 's' : '' }} FilePlayer à identifier et taguer.
            </p>
            <UProgress v-if="enrichWriting" :max="enrichBatch.length" :value="enrichProgress" />
          </template>

          <!-- Mode unitaire : aperçu du match (dryRun) -->
          <template v-else>
            <p v-if="enrichTrackRef" class="text-xs text-dimmed truncate">
              <UIcon name="i-lucide-music" class="inline size-3.5 mr-1" />{{ enrichTrackRef.title }}
            </p>
            <div v-if="enrichLoading" class="flex items-center gap-2 text-sm text-dimmed py-4 justify-center">
              <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" /> Identification…
            </div>
            <div v-else-if="enrichPreview" class="flex items-start gap-3">
              <div class="h-16 w-16 rounded overflow-hidden bg-elevated shrink-0 flex items-center justify-center">
                <img v-if="enrichCoverUrl" :src="enrichCoverUrl" class="h-full w-full object-cover" alt="" />
                <UIcon v-else name="i-lucide-disc-3" class="size-6 text-dimmed" />
              </div>
              <div class="min-w-0 flex-1 text-sm">
                <div class="flex items-center gap-2">
                  <UBadge :color="enrichPreview.matched ? 'success' : 'warning'" variant="subtle" size="xs">
                    {{ enrichPreview.matched ? 'Correspondance' : 'Incertain' }}
                  </UBadge>
                  <span v-if="enrichPreview.score != null" class="text-xs text-dimmed">score {{ Math.round((enrichPreview.score ?? 0) * 100) / 100 }}</span>
                </div>
                <p class="font-medium truncate mt-1">{{ enrichPreview.found?.title || '—' }}</p>
                <p class="text-xs text-dimmed truncate">{{ enrichPreview.found?.artist || '—' }}<span v-if="enrichPreview.found?.album"> · {{ enrichPreview.found?.album }}</span></p>
              </div>
            </div>
            <p v-else class="text-sm text-dimmed text-center py-4">Aucune information.</p>
          </template>

          <!-- Options communes -->
          <div class="space-y-2">
            <USwitch v-model="enrichOverwrite" label="Écraser les tags existants" :description="enrichOverwrite ? 'Remplace tout' : 'Complète seulement les manquants'" />
            <USwitch v-model="enrichCover" label="Intégrer la pochette" />
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <UButton label="Annuler" color="neutral" variant="soft" :disabled="enrichWriting" @click="enrichOpen = false" />
            <UButton
              :label="enrichIsBatch ? `Enrichir ${enrichBatch.length}` : 'Écrire'"
              icon="i-lucide-wand-sparkles" color="primary"
              :loading="enrichWriting" :disabled="enrichLoading"
              @click="confirmEnrich"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- PLAYER (v-if isMounted = client-only fiable, survit aux navigations) -->
    <Lecture/>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
