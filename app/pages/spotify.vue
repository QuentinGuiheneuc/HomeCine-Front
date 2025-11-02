<script setup lang="ts">
/* --------------------------- */
/* Types (déclarés en premier) */
/* --------------------------- */
type SavedTrack = {
  track: {
    id: string
    name: string
    uri: string
    duration_ms?: number
    artists?: { name: string }[]
    album?: { images?: { url: string }[] }
  } | null
}
type Paging<T> = {
  items: T[]
  limit: number
  offset: number
  total: number
  next: string | null
}
type PlaylistDetail = {
  id: string
  name: string
  description?: string | null
  images?: { url: string }[]
  uri?: string
  tracks: {
    limit: number
    total: number
    offset: number
    items: { track: any }[]
  }
}

/* --------------------------- */
/* Imports                     */
/* --------------------------- */
import Lecture from '@/components/spotify/components/lecture.vue'
import LibrarySidebar from '@/components/spotify/components/LibrarySidebar.vue'
import ItemPlaylist from '@/components/spotify/components/ItemPlaylist.vue'
import PlaylistList from '@/components/spotify/components/PlaylistList.vue'
import { usePlaylists } from '@/components/spotify/composable/usePlaylists'
import { useEventListener } from '@vueuse/core'
import http from '@/src/lib/https'

/* --------------------------- */
/* Setup & state               */
/* --------------------------- */
const playerHeight = 104
const { playlist, fetchPlaylist } = usePlaylists()
const route = useRoute()
const router = useRouter()

// null => vue liste ; 'liked' => Titres likés ; sinon => id playlist
const selectedId = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

/* Titres likés “comme une playlist” (chargés en entier) */
const likedDetail = ref<PlaylistDetail | null>(null)
const likedUris   = ref<string[]>([])

/* --------------------------- */
/* Helpers                     */
/* --------------------------- */
const toRows = (data: Paging<SavedTrack>) =>
  (data.items ?? [])
    .map(it => it?.track)
    .filter((t): t is NonNullable<SavedTrack['track']> => !!t)

/** Charge TOUTES les pages de /me/tracks et renvoie le tableau de tracks */
async function fetchAllLikedTracks(pageSize = 50) {
  const all: NonNullable<SavedTrack['track']>[] = []
  let offset = 0
  let total = Infinity

  // première page
  const first = await http.get<Paging<SavedTrack>>('/spotify/me/tracks', { params: { limit: pageSize, offset } })
  const firstData = (first as any).data ?? first
  all.push(...toRows(firstData))
  total = firstData.total
  offset = firstData.offset + firstData.limit

  // pages suivantes
  while (offset < total) {
    const res = await http.get<Paging<SavedTrack>>('/spotify/me/tracks', { params: { limit: pageSize, offset } })
    const data = (res as any).data ?? res
    all.push(...toRows(data))
    offset = data.offset + data.limit
  }

  return { all, total }
}

/* --------------------------- */
/* Deep-link initial & sync    */
/* --------------------------- */
onMounted(async () => {
  const id = route.query.pl as string | undefined
  if (id) {
    if (id === 'liked') await openLiked()
    else await selectPlaylist(id)
  }
})

watch(() => route.query.pl, async (pl) => {
  const id = (pl as string | undefined) || null
  if (!id) { selectedId.value = null; likedDetail.value = null; return }
  if (id === 'liked') { if (selectedId.value !== 'liked') await openLiked(); return }
  if (id !== selectedId.value) await selectPlaylist(id)
})

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && selectedId.value) clearSelection()
})

/* --------------------------- */
/* Navigation                  */
/* --------------------------- */
function clearSelection() {
  selectedId.value = null
  likedDetail.value = null
  const { pl, ...rest } = route.query
  router.replace({ query: rest })
}

/* --------------------------- */
/* Playlists “classiques”      */
/* --------------------------- */
async function selectPlaylist(id: string) {
  selectedId.value = id
  likedDetail.value = null
  loading.value = true
  error.value = null
  router.replace({ query: { ...route.query, pl: id } })
  try {
    await fetchPlaylist(id)
  } catch (e: any) {
    error.value = e?.message || 'Chargement impossible'
  } finally {
    loading.value = false
    if (process.client) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

/* Lecture dans un contexte playlist (ItemPlaylist émet { contextUri, offset }) */
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
  } catch (e) {
    console.error('[play ctx]', e)
  }
}

/* --------------------------- */
/* Titres likés (sans “charger plus”) */
/* --------------------------- */
async function openLiked() {
  selectedId.value = 'liked'
  loading.value = true
  error.value = null
  router.replace({ query: { ...route.query, pl: 'liked' } })

  try {
    // 1) Récupère TOUTES les pages
    const { all, total } = await fetchAllLikedTracks(50)

    // 2) Construit la “playlist virtuelle” complète
    likedUris.value = all.map(t => t.uri)
    likedDetail.value = {
      id: 'liked',
      name: 'Titres likés',
      description: 'Vos titres favoris',
      images: all[0]?.album?.images?.length ? [{ url: all[0].album!.images![0].url }] : [],
      uri: '',
      tracks: {
        limit: total,              // plus de pagination ici
        total,
        offset: 0,
        items: all.map(t => ({ track: t }))
      }
    }
  } catch (e: any) {
    error.value = e?.message || 'Chargement impossible'
  } finally {
    loading.value = false
    if (process.client) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

/* Lecture séquentielle d’une liste d’URIs à partir d’un index */
async function playQueueFromList(uris: string[], startIndex = 0) {
  if (!uris.length) return
  const i = Math.max(0, Math.min(startIndex, uris.length - 1))
  const ordered = [...uris.slice(i), ...uris.slice(0, i)]
  await http.put('/spotify/devices/play', { uris: ordered })
}

async function onPlayLikedAt(offset: number) {
  try { await playQueueFromList(likedUris.value, offset) }
  catch (e) { console.error('[play liked]', e) }
}
</script>

<template>
  <!-- Variable CSS pour la marge basse globale du contenu -->
  <div class="min-h-screen flex flex-col">
    <div class="flex-1 flex min-h-0" :style="{ '--player-h': playerHeight + 'px' }">
      <!-- Sidebar : émet select-playlist / open-liked -->
      <LibrarySidebar
        :player-height="playerHeight"
        @select-playlist="selectPlaylist"
        @open-liked="openLiked"
      />

      <main class="flex-1 min-w-0">
        <!-- Ce wrapper impose la hauteur dispo pour le contenu = (100vh - playerHeight) -->
        <div
          class="h-[calc(100vh-var(--player-h))] overflow-hidden pl-2 pb-3"
        >
          <!-- Un seul enfant direct pour Transition. Clé = 'list' | 'liked' | <playlistId> -->
          <Transition name="fade" mode="out-in">
            <div :key="selectedId ?? 'list'" class="h-full">
              <!-- Vue détail (playlist ou liked) -->
              <div v-if="selectedId" class="flex flex-col h-full min-h-0">
                <!-- Header sticky local -->
                <div class="mb-4 flex items-center gap-2 sticky top-0 z-10 bg-elevated/60 backdrop-blur py-2">
                  <UButton icon="i-lucide-arrow-left" variant="ghost" @click="clearSelection">Retour</UButton>
                  <span class="text-sm text-dimmed">
                    {{ selectedId === 'liked' ? 'Titres likés' : `Playlist: ${selectedId}` }}
                  </span>
                </div>

                <!-- États -->
                <UAlert v-if="error" color="red" class="mb-3" :title="error">
                  <template #actions>
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-rotate-ccw"
                      @click="selectedId === 'liked' ? openLiked() : (selectedId && selectPlaylist(selectedId))"
                    >
                      Réessayer
                    </UButton>
                  </template>
                </UAlert>

                <div v-else-if="loading" class="space-y-3 mb-6">
                  <USkeleton class="h-6 w-1/3" />
                  <USkeleton class="h-24 w-full" />
                  <USkeleton class="h-10 w-full" />
                  <USkeleton class="h-10 w-full" />
                </div>

                <!-- Détail : Liked (playlist virtuelle SANS bouton “charger plus”) -->
                <ItemPlaylist
                  v-else-if="selectedId === 'liked' && likedDetail"
                  :key="'liked'"
                  :item="likedDetail"
                  :user-id="11156740298"
                  :player-height="playerHeight"
                  @play-in-context="({ offset }) => onPlayLikedAt(offset)"
                />

                <!-- Détail : Playlist classique -->
                <ItemPlaylist
                  v-else-if="selectedId !== 'liked' && playlist"
                  :key="selectedId"
                  :item="playlist"
                  :player-height="playerHeight"
                  @play-in-context="onPlayInContext"
                />

                <div v-else class="text-sm text-dimmed">Aucune donnée.</div>
              </div>

              <!-- Vue liste par défaut -->
              <div v-else class="h-full overflow-auto">
                <h1 class="text-2xl font-semibold mb-6">Playlists</h1>
                <PlaylistList />
              </div>
            </div>
          </Transition>
        </div>
      </main>
    </div>

    <!-- Player collé en bas -->
    <ClientOnly><Lecture /></ClientOnly>
  </div>
</template>

<style scoped>
/* Transition douce */
.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
