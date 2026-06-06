<script setup lang="ts">
import Lecture        from '@/components/spotify/components/lecture.vue'
import LibrarySidebar from '@/components/spotify/components/LibrarySidebar.vue'
import HomeView       from '@/components/spotify/components/HomeView.vue'
import ItemPlaylist   from '@/components/spotify/components/ItemPlaylist.vue'
import ItemAlbum      from '@/components/spotify/components/ItemAlbum.vue'
import ItemArtist     from '@/components/spotify/components/ItemArtist.vue'
import { useEventListener } from '@vueuse/core'
import {
  getPlaylistTracks, getAlbumTracks, getArtistTracks, getArtistAlbums,
  enqueueTrack, play, type PlayType,
  type LibrarySource, type LibraryTrack,
  type LibraryPlaylist, type LibraryAlbum, type LibraryArtist
} from '@/src/api/library'
import {
  mapPlaylistDetail, mapAlbumDetail, mapArtistDetail
} from '@/components/spotify/composable/useLibraryMappers'

const toast = useToast()
const { activeLecteurId } = useDashboard()
const playerHeight = 104
const sidebarOpen  = ref(false)

/* ─── Sélection courante ─────────────────────────────────────────────────── */
type ViewType = 'home' | 'playlist' | 'album' | 'artist'
const viewType = ref<ViewType>('home')

const loading = ref(false)
const error   = ref<string | null>(null)

/* Détails mappés (forme Spotify pour les Item*) */
const playlistDetail = ref<any>(null)
const albumDetail    = ref<any>(null)
const artistDetail   = ref<any>(null)

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
  return 'home'
})
const currentName = computed(() =>
  viewType.value === 'playlist' ? playlistDetail.value?.name :
  viewType.value === 'album'    ? albumDetail.value?.name :
  viewType.value === 'artist'   ? artistDetail.value?.name : ''
)
const currentCover = computed(() =>
  viewType.value === 'playlist' ? playlistDetail.value?.images?.[0]?.url :
  viewType.value === 'album'    ? albumDetail.value?.images?.[0]?.url :
  viewType.value === 'artist'   ? artistDetail.value?.images?.[0]?.url : null
)

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function clearAll() {
  playlistDetail.value = null
  albumDetail.value    = null
  artistDetail.value   = null
  currentCtx.value     = null
  trackByUri = new Map()
}
function clearSelection() { clearAll(); viewType.value = 'home' }

function indexTracks(tracks: LibraryTrack[]) {
  for (const t of tracks) {
    const uri = String(t.uri ?? t.id ?? '')
    if (uri) trackByUri.set(uri, t)
  }
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && viewType.value !== 'home') clearSelection()
})

/* ─── Ouvertures ─────────────────────────────────────────────────────────── */
async function openPlaylist(p: LibraryPlaylist) {
  clearAll()
  viewType.value = 'playlist'
  currentCtx.value = { source: p.source, id: p.id, lecteurId: (p as any).lecteurId }
  loading.value = true; error.value = null
  // En-tête visible immédiatement (même si les pistes échouent)
  playlistDetail.value = mapPlaylistDetail(p, [])
  try {
    const tracks = await getPlaylistTracks(p.source, p.id, 100)
    indexTracks(tracks)
    playlistDetail.value = mapPlaylistDetail(p, tracks)
  } catch (e: any) {
    const status = e?.response?.status
    error.value = status === 403
      ? 'Playlist non accessible via l\'API Spotify (playlist éditoriale ou algorithmique : Discover Weekly, Radar des sorties, Daily Mix…).'
      : (e?.message || 'Chargement impossible')
  } finally { loading.value = false }
}

async function openAlbum(a: LibraryAlbum) {
  clearAll()
  viewType.value = 'album'
  currentCtx.value = { source: a.source, id: a.id, lecteurId: (a as any).lecteurId }
  loading.value = true; error.value = null
  try {
    const tracks = await getAlbumTracks(a.source, a.id)
    indexTracks(tracks)
    albumDetail.value = mapAlbumDetail(a, tracks)
  } catch (e: any) { error.value = e?.message || 'Chargement impossible' }
  finally { loading.value = false }
}

async function openArtist(ar: LibraryArtist) {
  clearAll()
  viewType.value = 'artist'
  currentCtx.value = { source: ar.source, id: ar.id, lecteurId: (ar as any).lecteurId }
  loading.value = true; error.value = null
  try {
    const [tracks, albums] = await Promise.all([
      getArtistTracks(ar.source, ar.id).catch(() => []),
      getArtistAlbums(ar.source, ar.id).catch(() => [])
    ])
    indexTracks(tracks)
    artistDetail.value = mapArtistDetail(ar, tracks, albums)
  } catch (e: any) { error.value = e?.message || 'Chargement impossible' }
  finally { loading.value = false }
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

/* ─── ▶ Lire un contexte (POST /library/play { source, type, id|uri, lecteurId }) ─ */
async function playContextCurrent(type: PlayType) {
  if (!currentCtx.value) return
  try {
    await play({ source: currentCtx.value.source, type, id: currentCtx.value.id, lecteurId: targetLecteur.value })
    toast.add({ title: 'Lecture lancée', description: currentName.value, color: 'success', icon: 'i-lucide-play' })
  } catch { toast.add({ title: 'Lecture impossible', color: 'error' }) }
}

/** Lit une piste précise (uri émis par ItemAlbum/ItemArtist) */
async function playTrackByUri(uri: string) {
  const t = trackByUri.get(uri)
  if (!t) return
  try {
    await play({ source: t.source, type: 'track', uri: t.uri ?? uri, lecteurId: targetLecteur.value })
    toast.add({ title: 'Lecture lancée', description: t.title, color: 'success', icon: 'i-lucide-play' })
  } catch { toast.add({ title: 'Lecture impossible', color: 'error' }) }
}

/** ItemPlaylist row → lit la piste à l'offset */
function onPlaylistRow(payload: { offset: number }) {
  const t = (playlistDetail.value?.tracks?.items?.[payload.offset]?.track)?.__src as LibraryTrack | undefined
  if (t?.uri) playTrackByUri(t.uri)
}
</script>

<template>
  <div class="h-screen overflow-hidden flex flex-col">
    <div class="flex flex-1 min-h-0 overflow-hidden">

      <!-- SIDEBAR desktop -->
      <aside class="hidden md:block w-72 shrink-0 h-full">
        <LibrarySidebar
          :player-height="playerHeight"
          @select-playlist="openPlaylist"
          @select-album="openAlbum"
          @select-artist="openArtist"
        />
      </aside>

      <!-- SIDEBAR mobile -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="sidebarOpen" class="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" @click="sidebarOpen = false" />
        </Transition>
        <div class="md:hidden fixed left-0 top-0 bottom-0 z-50 w-72 transition-transform duration-200" :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'">
          <LibrarySidebar
            :player-height="playerHeight"
            @select-playlist="(p) => { openPlaylist(p); sidebarOpen = false }"
            @select-album="(a) => { openAlbum(a); sidebarOpen = false }"
            @select-artist="(ar) => { openArtist(ar); sidebarOpen = false }"
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
                  <UButton icon="i-lucide-arrow-left" variant="ghost" size="sm" @click="clearSelection" />
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
                  @play-in-context="onPlaylistRow"
                  @enqueue-all="() => playContextCurrent('playlist')"
                />

                <ItemAlbum
                  v-else-if="viewType === 'album' && albumDetail"
                  :key="`al:${currentCtx?.id}`"
                  :item="albumDetail"
                  :player-height="playerHeight"
                  @play-track="playTrackByUri"
                  @enqueue-all="() => playContextCurrent('album')"
                  @select-artist="(id) => currentCtx && openArtistById(currentCtx.source, id)"
                />

                <ItemArtist
                  v-else-if="viewType === 'artist' && artistDetail"
                  :key="`ar:${currentCtx?.id}`"
                  :item="artistDetail"
                  :player-height="playerHeight"
                  @play-track="playTrackByUri"
                  @select-album="(id) => currentCtx && openAlbumById(currentCtx.source, id)"
                />

                <div v-else-if="!loading && !error" class="text-sm text-dimmed px-2">Aucune donnée disponible.</div>
              </div>

              <!-- Accueil -->
              <div v-else class="relative h-full">
                <UButton class="md:hidden absolute top-3 left-3 z-10 shadow" icon="i-lucide-library" color="neutral" variant="soft" size="sm" @click="sidebarOpen = true" />
                <HomeView
                  @select-playlist="openPlaylist"
                  @select-album="openAlbum"
                  @select-artist="openArtist"
                  @enqueue-track="doEnqueueTrack"
                />
              </div>
            </div>
          </Transition>
        </div>
      </main>
    </div>

    <!-- PLAYER -->
    <ClientOnly><Lecture /></ClientOnly>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
