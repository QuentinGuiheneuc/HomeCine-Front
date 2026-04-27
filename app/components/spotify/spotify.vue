<script setup lang="ts">
/* ─────────────────── Imports ─────────────────── */
import Lecture      from './components/lecture.vue'
import LibrarySidebar from './components/LibrarySidebar.vue'
import ItemPlaylist from './components/ItemPlaylist.vue'
import ItemAlbum    from './components/ItemAlbum.vue'
import ItemArtist   from './components/ItemArtist.vue'
import HomeView     from './components/HomeView.vue'
import { usePlaylists } from './composable/usePlaylists'
import { useEventListener } from '@vueuse/core'
import http from '@/src/lib/https'

/* ─────────────────── Types ─────────────────── */
type SavedTrack = {
  track: {
    id: string; name: string; uri: string; duration_ms?: number
    artists?: { name: string }[]
    album?: { images?: { url: string }[] }
  } | null
}
type Paging<T> = { items: T[]; limit: number; offset: number; total: number; next: string | null }

type PlaylistDetail = {
  id: string; name: string; description?: string | null
  images?: { url: string }[]; uri?: string
  tracks: { limit: number; total: number; offset: number; items: { track: any }[] }
}

type AlbumDetail = {
  id: string; name: string; album_type?: string; release_date?: string
  total_tracks?: number; images?: { url: string }[]; uri?: string; label?: string
  artists?: { id: string; name: string }[]
  tracks?: { items: any[]; total: number; limit: number; offset: number; next?: string | null }
}

type ArtistDetail = {
  id: string; name: string; genres?: string[]; images?: { url: string }[]
  uri?: string; followers?: { total: number }; popularity?: number
  topTracks?: any[]; albums?: any[]
}

/* ─────────────────── Setup ─────────────────── */
const playerHeight = 117

const { playlist, fetchPlaylist } = usePlaylists()
const route  = useRoute()
const router = useRouter()

// ── Vue courante ──
const selectedId       = ref<string | null>(null)   // playlist / liked
const selectedAlbumId  = ref<string | null>(null)
const selectedArtistId = ref<string | null>(null)

const loading = ref(false)
const error   = ref<string | null>(null)

// ── Données spécifiques ──
const likedDetail   = ref<PlaylistDetail | null>(null)
const likedUris     = ref<string[]>([])
const albumDetail   = ref<AlbumDetail | null>(null)
const artistDetail  = ref<ArtistDetail | null>(null)

// ── Vue type calculé ──
type ViewType = 'home' | 'liked' | 'playlist' | 'album' | 'artist'
const viewType = computed<ViewType>(() => {
  if (selectedId.value === 'liked') return 'liked'
  if (selectedId.value)       return 'playlist'
  if (selectedAlbumId.value)  return 'album'
  if (selectedArtistId.value) return 'artist'
  return 'home'
})

const viewKey = computed(() => {
  if (viewType.value === 'liked')    return 'liked'
  if (viewType.value === 'playlist') return `pl:${selectedId.value}`
  if (viewType.value === 'album')    return `al:${selectedAlbumId.value}`
  if (viewType.value === 'artist')   return `ar:${selectedArtistId.value}`
  return 'home'
})

/* ─────────────────── Helpers ─────────────────── */
const toRows = (data: Paging<SavedTrack>) =>
  (data.items ?? []).map(it => it?.track).filter((t): t is NonNullable<SavedTrack['track']> => !!t)

function clearState() {
  selectedId.value       = null
  selectedAlbumId.value  = null
  selectedArtistId.value = null
  likedDetail.value      = null
  albumDetail.value      = null
  artistDetail.value     = null
}

/* ─────────────────── Navigation URL ─────────────────── */
onMounted(async () => {
  const pl = route.query.pl as string | undefined
  const al = route.query.al as string | undefined
  const ar = route.query.ar as string | undefined
  if (pl === 'liked')       await openLiked()
  else if (pl)              await selectPlaylist(pl)
  else if (al)              await selectAlbum(al)
  else if (ar)              await selectArtist(ar)
})

watch(() => route.query, async (q) => {
  const pl = (q.pl as string | undefined) || null
  const al = (q.al as string | undefined) || null
  const ar = (q.ar as string | undefined) || null

  if (!pl && !al && !ar) { clearState(); return }
  if (pl === 'liked'  && selectedId.value !== 'liked')    { await openLiked(); return }
  if (pl && pl !== 'liked' && pl !== selectedId.value)    { await selectPlaylist(pl); return }
  if (al && al !== selectedAlbumId.value)                 { await selectAlbum(al); return }
  if (ar && ar !== selectedArtistId.value)                { await selectArtist(ar); return }
}, { deep: true })

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && viewType.value !== 'home') clearSelection()
})

/* ─────────────────── Navigation ─────────────────── */
function clearSelection() {
  clearState()
  const { pl: _pl, al: _al, ar: _ar, ...rest } = route.query
  router.replace({ query: rest })
}

/* ─────────────────── Playlists ─────────────────── */
async function selectPlaylist(id: string) {
  clearState()
  selectedId.value = id
  loading.value    = true
  error.value      = null
  router.replace({ query: { ...route.query, pl: id, al: undefined, ar: undefined } })
  try {
    await fetchPlaylist(id)
  } catch (e: any) {
    error.value = e?.message || 'Chargement impossible'
  } finally {
    loading.value = false
  }
}

async function onPlayInContext(payload: { contextUri?: string; offset: number }) {
  try {
    if (selectedId.value === 'liked') {
      await onPlayLikedAt(payload.offset)
    } else if (payload.contextUri) {
      await http.put('/spotify/devices/play', {
        context_uri: payload.contextUri,
        offset: { position: payload.offset }
      })
    }
  } catch (e) { console.error('[play ctx]', e) }
}

/* ─────────────────── Titres likés ─────────────────── */
async function fetchAllLikedTracks(pageSize = 50) {
  const all: NonNullable<SavedTrack['track']>[] = []
  let offset = 0, total = Infinity
  const first = await http.get<Paging<SavedTrack>>('/spotify/me/tracks', { params: { limit: pageSize, offset } })
  const fd = (first as any).data ?? first
  all.push(...toRows(fd)); total = fd.total; offset = fd.offset + fd.limit
  while (offset < total) {
    const res = await http.get<Paging<SavedTrack>>('/spotify/me/tracks', { params: { limit: pageSize, offset } })
    const d = (res as any).data ?? res
    all.push(...toRows(d)); offset = d.offset + d.limit
  }
  return { all, total }
}

async function openLiked() {
  clearState()
  selectedId.value = 'liked'
  loading.value    = true
  error.value      = null
  router.replace({ query: { ...route.query, pl: 'liked', al: undefined, ar: undefined } })
  try {
    const { all, total } = await fetchAllLikedTracks(50)
    likedUris.value  = all.map(t => t.uri)
    likedDetail.value = {
      id: 'liked', name: 'Titres likés', description: 'Vos titres favoris',
      images: all[0]?.album?.images?.length ? [{ url: all[0].album!.images![0].url }] : [],
      uri: '',
      tracks: { limit: total, total, offset: 0, items: all.map(t => ({ track: t })) }
    }
  } catch (e: any) {
    error.value = e?.message || 'Chargement impossible'
  } finally {
    loading.value = false
  }
}

async function playQueueFromList(uris: string[], startIndex = 0) {
  if (!uris.length) return
  const i = Math.max(0, Math.min(startIndex, uris.length - 1))
  await http.put('/spotify/devices/play', { uris: [...uris.slice(i), ...uris.slice(0, i)] })
}

async function onPlayLikedAt(offset: number) {
  try { await playQueueFromList(likedUris.value, offset) }
  catch (e) { console.error('[play liked]', e) }
}

/* ─────────────────── Albums ─────────────────── */
async function selectAlbum(id: string) {
  clearState()
  selectedAlbumId.value = id
  loading.value         = true
  error.value           = null
  router.replace({ query: { ...route.query, al: id, pl: undefined, ar: undefined } })
  try {
    const res  = await http.get<AlbumDetail>(`/spotify/albums/${id}`, { params: { market: 'FR' } })
    albumDetail.value = (res as any).data ?? res
  } catch (e: any) {
    error.value = e?.message || 'Chargement impossible'
  } finally {
    loading.value = false
  }
}

const albumLoadingMore = ref(false)
const albumHasMore     = computed(() => {
  if (!albumDetail.value?.tracks) return false
  const { items, total } = albumDetail.value.tracks
  return items.length < total
})

async function albumLoadMore() {
  if (!albumDetail.value || albumLoadingMore.value) return
  albumLoadingMore.value = true
  try {
    const offset = albumDetail.value.tracks?.items.length ?? 0
    const res = await http.get(`/spotify/albums/${albumDetail.value.id}/tracks`, {
      params: { limit: 50, offset, market: 'FR' }
    })
    const data = (res as any).data ?? res
    if (albumDetail.value.tracks) {
      albumDetail.value = {
        ...albumDetail.value,
        tracks: {
          ...albumDetail.value.tracks,
          items: [...albumDetail.value.tracks.items, ...(data.items ?? [])],
        }
      }
    }
  } finally {
    albumLoadingMore.value = false
  }
}

async function onAlbumPlayTrack(uri: string) {
  try { await http.put('/spotify/devices/play', { uris: [uri] }) }
  catch (e) { console.error('[play album track]', e) }
}

/* ─────────────────── Artistes ─────────────────── */
async function selectArtist(id: string) {
  clearState()
  selectedArtistId.value = id
  loading.value          = true
  error.value            = null
  router.replace({ query: { ...route.query, ar: id, pl: undefined, al: undefined } })
  try {
    // allSettled : une requête qui échoue n'annule pas les autres
    const [artistRes, topRes, albumsRes] = await Promise.allSettled([
      http.get(`/spotify/artists/${id}`),
      http.get(`/spotify/artists/${id}/top-tracks`, { params: { market: 'FR' } }),
      http.get(`/spotify/artists/${id}/albums`, { params: { include_groups: 'album,single', market: 'FR', limit: 20 } }),
    ])

    if (artistRes.status === 'rejected') {
      const status = (artistRes.reason as any)?.response?.status
      console.error('[selectArtist] GET /artists/:id →', status, artistRes.reason)
      throw new Error(`Artiste introuvable (${status ?? 'réseau'})`)
    }

    const a  = (artistRes.value  as any).data ?? artistRes.value
    const tp = topRes.status    === 'fulfilled' ? ((topRes.value    as any).data ?? topRes.value)    : null
    const al = albumsRes.status === 'fulfilled' ? ((albumsRes.value as any).data ?? albumsRes.value) : null

    if (topRes.status === 'rejected')
      console.warn('[selectArtist] top-tracks →', (topRes.reason as any)?.response?.status, topRes.reason)
    if (albumsRes.status === 'rejected')
      console.warn('[selectArtist] albums →', (albumsRes.reason as any)?.response?.status, albumsRes.reason)

    artistDetail.value = {
      ...a,
      topTracks: tp?.tracks ?? [],
      albums:    al?.items  ?? [],
    }
    console.log('[selectArtist] artistDetail set:', artistDetail.value?.name, '| topTracks:', artistDetail.value?.topTracks?.length, '| albums:', artistDetail.value?.albums?.length)
  } catch (e: any) {
    error.value = e?.message || 'Chargement impossible'
    console.error('[selectArtist] error:', error.value)
  } finally {
    loading.value = false
  }
}

/* ─────────────────── Breadcrumb ─────────────────── */
const breadcrumb = computed(() => {
  if (viewType.value === 'liked')    return 'Titres likés'
  if (viewType.value === 'playlist') return playlist.value?.name || `Playlist: ${selectedId.value}`
  if (viewType.value === 'album')    return albumDetail.value?.name  || `Album: ${selectedAlbumId.value}`
  if (viewType.value === 'artist')   return artistDetail.value?.name || `Artiste: ${selectedArtistId.value}`
  return ''
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <div class="flex-1 flex min-h-0" :style="{ '--player-h': playerHeight + 'px' }">

      <!-- Sidebar -->
      <LibrarySidebar
        :player-height="playerHeight"
        @select-playlist="selectPlaylist"
        @select-album="selectAlbum"
        @select-artist="selectArtist"
        @open-liked="openLiked"
      />

      <main class="flex-1 min-w-0">
        <div class="h-[calc(100vh-var(--player-h))] overflow-hidden pl-2 pb-3">
          <Transition name="fade" mode="out-in">
            <div :key="viewKey" class="h-full">

              <!-- ── Détail ── -->
              <div v-if="viewType !== 'home'" class="flex flex-col h-full min-h-0">

                <!-- Header retour -->
                <div class="mb-4 flex items-center gap-2 sticky top-0 z-10 bg-elevated/60 backdrop-blur py-2">
                  <UButton icon="i-lucide-arrow-left" variant="ghost" @click="clearSelection">Retour</UButton>
                  <span class="text-sm text-dimmed truncate">{{ breadcrumb }}</span>
                </div>

                <!-- Erreur -->
                <UAlert v-if="error" color="red" class="mb-3" :title="error">
                  <template #actions>
                    <UButton
                      size="xs" variant="soft" icon="i-lucide-rotate-ccw"
                      @click="
                        viewType === 'liked'   ? openLiked() :
                        viewType === 'playlist' && selectedId ? selectPlaylist(selectedId) :
                        viewType === 'album'   && selectedAlbumId ? selectAlbum(selectedAlbumId) :
                        viewType === 'artist'  && selectedArtistId ? selectArtist(selectedArtistId) : null
                      "
                    >Réessayer</UButton>
                  </template>
                </UAlert>

                <!-- Skeleton -->
                <div v-else-if="loading" class="space-y-3 mb-6">
                  <USkeleton class="h-6 w-1/3" />
                  <USkeleton class="h-24 w-full" />
                  <USkeleton class="h-10 w-full" />
                  <USkeleton class="h-10 w-full" />
                </div>

                <!-- Titres likés -->
                <ItemPlaylist
                  v-else-if="viewType === 'liked' && likedDetail"
                  key="liked"
                  :item="likedDetail"
                  :user-id="11156740298"
                  :player-height="playerHeight"
                  @play-in-context="({ offset }) => onPlayLikedAt(offset)"
                />

                <!-- Playlist classique -->
                <ItemPlaylist
                  v-else-if="viewType === 'playlist' && playlist"
                  :key="`pl:${selectedId}`"
                  :item="playlist"
                  :player-height="playerHeight"
                  @play-in-context="onPlayInContext"
                />

                <!-- Album -->
                <ItemAlbum
                  v-else-if="viewType === 'album' && albumDetail"
                  :key="`al:${selectedAlbumId}`"
                  :item="albumDetail"
                  :player-height="playerHeight"
                  :has-more="albumHasMore"
                  :loading-more="albumLoadingMore"
                  @load-more="albumLoadMore"
                  @play-track="onAlbumPlayTrack"
                  @select-artist="selectArtist"
                />

                <!-- Artiste -->
                <ItemArtist
                  v-else-if="viewType === 'artist' && artistDetail"
                  :key="`ar:${selectedArtistId}`"
                  :item="(artistDetail as ArtistDetail)"
                  :player-height="playerHeight"
                  @select-album="selectAlbum"
                  @play-track="onAlbumPlayTrack"
                />

                <div v-else-if="!loading && !error" class="text-sm text-dimmed">Aucune donnée.</div>
              </div>

              <!-- ── Vue accueil ── -->
              <div v-else class="h-full overflow-hidden">
                <HomeView
                  :player-height="playerHeight"
                  @select-playlist="selectPlaylist"
                  @open-liked="openLiked"
                  @play-uri="(uri) => http.put('/spotify/devices/play', { context_uri: uri }).catch(()=>{})"
                />
              </div>

            </div>
          </Transition>
        </div>
      </main>
    </div>

    <ClientOnly><Lecture /></ClientOnly>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
