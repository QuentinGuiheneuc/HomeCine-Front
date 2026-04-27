<script setup lang="ts">
import http from '@/src/lib/https'
const { menue } = useDashboard()

/* ── Props ── */
const props = withDefaults(defineProps<{
  headerHeight?: number
  playerHeight?: number
  playerHeighti?: number
}>(), {
  headerHeight: 92,
  playerHeight: 110,
  playerHeighti: 104
})

/* ── Types ── */
type Image = { url: string; width: number | null; height: number | null }

type Playlist = {
  id: string; name: string; uri: string; href: string
  images?: Image[]
  tracks?: { href: string; total: number }
  snapshot_id?: string
  owner?: { display_name?: string }
}

type SavedAlbum = {
  added_at: string
  album: {
    id: string; name: string; album_type: string
    release_date?: string; total_tracks?: number
    images?: Image[]; uri: string
    artists: { id: string; name: string }[]
  }
}

type FollowedArtist = {
  id: string; name: string
  images?: Image[]
  genres?: string[]
  followers?: { total: number }
  uri: string
}

type Paging<T> = { href: string; items: T[]; limit: number; next: string | null; offset: number; previous: string | null; total: number }

type SnapshotPayload = { generated_at: string; total: number }

/* ── Onglets ── */
type Section = 'playlists' | 'albums' | 'artists'
const sections: { key: Section; label: string; icon: string }[] = [
  { key: 'playlists', label: 'Playlists', icon: 'i-lucide-list-music' },
  { key: 'albums',    label: 'Albums',    icon: 'i-lucide-disc-3'     },
  { key: 'artists',   label: 'Artistes',  icon: 'i-lucide-mic-2'      }
]

/* ── Emits ── */
const emit = defineEmits<{
  (e: 'select-playlist', id: string): void
  (e: 'select-album',    id: string): void
  (e: 'select-artist',   id: string): void
  (e: 'create-playlist'): void
  (e: 'refresh'): void
  (e: 'open-liked'): void
}>()

/* ── State ── */
const active  = ref<Section>('playlists')
const loading = ref(false)
const errorMsg = ref<string | null>(null)

// ── Playlists ──
const items  = ref<Playlist[]>([])
const paging = reactive({ limit: 50, offset: 0, total: 0 })

// ── Albums ──
const albumItems  = ref<SavedAlbum[]>([])
const albumPaging = reactive({ limit: 50, offset: 0, total: 0 })
const albumsLoaded = ref(false)

// ── Artistes ──
const artistItems  = ref<FollowedArtist[]>([])
const artistTotal  = ref(0)
const artistCursor = ref<string | null>(null)
const artistsLoaded = ref(false)

// ── Liked meta ──
const likedTotal       = ref<number | null>(null)
const likedGeneratedAt = ref<string | null>(null)
const likedBusy        = ref(false)

/* ── Recherche locale ── */
const q = ref('')
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const filteredPlaylists = computed(() => {
  if (!q.value) return items.value
  const n = normalize(q.value)
  return items.value.filter(p => normalize(p.name).includes(n))
})

const filteredAlbums = computed(() => {
  if (!q.value) return albumItems.value
  const n = normalize(q.value)
  return albumItems.value.filter(a =>
    normalize(a.album.name).includes(n) ||
    a.album.artists.some(ar => normalize(ar.name).includes(n))
  )
})

const filteredArtists = computed(() => {
  if (!q.value) return artistItems.value
  const n = normalize(q.value)
  return artistItems.value.filter(a => normalize(a.name).includes(n))
})

/* ── Fetch Playlists ── */
async function fetchPlaylists(limit = paging.limit, offset = 0) {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await http.get<Paging<Playlist>>('/spotify/playlists/me', { params: { limit, offset } })
    const data = (res as any).data ?? res
    items.value    = data.items ?? []
    paging.limit   = data.limit
    paging.offset  = data.offset
    paging.total   = data.total
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Impossible de charger vos playlists'
  } finally {
    loading.value = false
  }
}

/* ── Fetch Albums ── */
async function fetchAlbums(limit = 50, offset = 0) {
  loading.value  = true
  errorMsg.value = null
  try {
    const res  = await http.get<Paging<SavedAlbum>>('/spotify/me/albums', { params: { limit, offset, market: 'FR' } })
    const data = (res as any).data ?? res
    albumItems.value   = data.items ?? []
    albumPaging.limit  = data.limit
    albumPaging.offset = data.offset
    albumPaging.total  = data.total
    albumsLoaded.value = true
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Impossible de charger vos albums'
  } finally {
    loading.value = false
  }
}

/* ── Fetch Artistes ── */
async function fetchArtists(limit = 50, after?: string) {
  loading.value  = true
  errorMsg.value = null
  try {
    const params: Record<string, any> = { limit }
    if (after) params.after = after
    const res  = await http.get<{ artists: { items: FollowedArtist[]; total: number; cursors?: { after?: string }; next: string | null } }>(
      '/spotify/me/following/artists', { params }
    )
    const data = (res as any).data ?? res
    const artistsData = data.artists ?? data
    artistItems.value  = artistsData.items ?? []
    artistTotal.value  = artistsData.total ?? 0
    artistCursor.value = artistsData.cursors?.after ?? null
    artistsLoaded.value = true
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Impossible de charger vos artistes'
  } finally {
    loading.value = false
  }
}

/* ── Liked meta ── */
async function fetchLikedMeta() {
  likedBusy.value = true
  try {
    const res  = await http.get<SnapshotPayload>('/spotify/me/tracks/sync-json')
    const data = (res as any).data ?? res
    likedTotal.value       = data?.total ?? 0
    likedGeneratedAt.value = data?.generated_at ?? null
  } catch {
    likedTotal.value       = likedTotal.value ?? null
    likedGeneratedAt.value = likedGeneratedAt.value ?? null
  } finally {
    likedBusy.value = false
  }
}

async function regenerateSnapshot() {
  if (likedBusy.value) return
  likedBusy.value = true
  try {
    await http.post('/spotify/me/tracks/sync-json', {})
    await fetchLikedMeta()
  } catch (e: any) {
    console.error('[LibrarySidebar] regenerateSnapshot error:', e)
  } finally {
    likedBusy.value = false
  }
}

/* ── Refresh selon l'onglet ── */
async function onRefresh() {
  emit('refresh')
  q.value = ''
  if (active.value === 'playlists') {
    await fetchPlaylists()
    await fetchLikedMeta()
  } else if (active.value === 'albums') {
    albumsLoaded.value = false
    await fetchAlbums()
  } else if (active.value === 'artists') {
    artistsLoaded.value = false
    await fetchArtists()
  }
}

/* ── Charger à la demande selon onglet ── */
watch(active, async (tab) => {
  q.value = ''
  if (tab === 'albums'  && !albumsLoaded.value)  await fetchAlbums()
  if (tab === 'artists' && !artistsLoaded.value) await fetchArtists()
})

/* ── Actions playlists ── */
const actionBusy = ref<string | null>(null)

async function playPlaylist(p: Playlist) {
  try {
    actionBusy.value = p.id
    await http.put('/spotify/devices/play', { context_uri: p.uri, offset: { position: 0 } })
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Lecture impossible'
  } finally {
    actionBusy.value = null
  }
}

async function renamePlaylist(p: Playlist) {
  const name = window.prompt('Nouveau nom de la playlist :', p.name)
  if (!name || name.trim() === p.name) return
  try {
    actionBusy.value = p.id
    await http.put(`/spotify/playlists/${p.id}`, { name: name.trim() })
    const target = items.value.find(i => i.id === p.id)
    if (target) target.name = name.trim()
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Renommage impossible'
  } finally {
    actionBusy.value = null
  }
}

async function deletePlaylist(p: Playlist) {
  if (!confirm(`Retirer « ${p.name} » de votre bibliothèque ?`)) return
  try {
    actionBusy.value = p.id
    await http.delete(`/spotify/playlists/${p.id}/follow`)
    items.value  = items.value.filter(i => i.id !== p.id)
    paging.total = Math.max(0, paging.total - 1)
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Suppression impossible'
  } finally {
    actionBusy.value = null
  }
}

/* ── Helpers affichage ── */
const albumYear = (a: SavedAlbum['album']) => a.release_date?.split('-')[0] ?? ''

/* ── Init ── */
onMounted(async () => {
  await fetchPlaylists()
  await fetchLikedMeta()
})

/* ── Scroll ── */
const scrollStyle = computed(() => ({
  maxHeight: `calc(100vh - ${110}px - ${props.playerHeight}px)`
}))
</script>

<template>
  <aside class="w-72 shrink-0 border-r border-default bg-elevated/30 flex flex-col h-full">

    <!-- HEADER sticky -->
    <div class="sticky top-0 z-10 bg-elevated/60 backdrop-blur border-b border-default">
      <div class="px-3 pt-3 flex items-center gap-2">
        <UTooltip text="Menu">
          <UButton icon="i-lucide:menu" color="neutral" variant="ghost" square @click="menue = !menue" />
        </UTooltip>
        <UInput
          v-model="q"
          placeholder="Rechercher…"
          icon="i-lucide-search"
          class="flex-1"
        />
        <UTooltip text="Nouvelle playlist">
          <UButton icon="i-lucide-plus" color="neutral" variant="ghost" square @click="$emit('create-playlist')" />
        </UTooltip>
        <UTooltip text="Rafraîchir">
          <UButton icon="i-lucide-refresh-ccw" color="neutral" variant="ghost" square :loading="loading" @click="onRefresh" />
        </UTooltip>
      </div>

      <!-- Onglets -->
      <div class="px-2 pt-2 pb-2">
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="s in sections"
            :key="s.key"
            class="flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs hover:bg-elevated/50 transition-colors"
            :class="active === s.key ? 'bg-elevated/70 text-highlighted' : 'text-dimmed'"
            @click="active = s.key"
          >
            <UIcon :name="s.icon" class="size-4" />
            <span class="truncate">{{ s.label }}</span>
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="px-3 pb-2 flex items-center justify-between">
        <p class="text-xs text-dimmed">
          <template v-if="active === 'playlists'">
            Playlists <span v-if="paging.total">({{ paging.total }})</span>
          </template>
          <template v-else-if="active === 'albums'">
            Albums <span v-if="albumPaging.total">({{ albumPaging.total }})</span>
          </template>
          <template v-else-if="active === 'artists'">
            Artistes <span v-if="artistTotal">({{ artistTotal }})</span>
          </template>
        </p>
        <UIcon v-if="loading" name="i-lucide-loader-circle" class="animate-spin text-dimmed size-4" />
      </div>
    </div>

    <!-- CORPS scrollable -->
    <div class="p-2 overflow-y-auto flex-1 min-h-0">
      <UAlert v-if="errorMsg" color="red" class="mb-2" :title="errorMsg" />

      <!-- ═══ PLAYLISTS ═══ -->
      <template v-if="active === 'playlists'">
        <!-- Titres likés -->
        <div class="group relative mb-1.5">
          <button
            class="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left"
            @click="$emit('open-liked')"
          >
            <div class="h-8 w-8 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-heart" class="text-white size-4" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm">Titres likés
                <UBadge v-if="likedTotal !== null" size="xs" variant="subtle" class="ml-1">{{ likedTotal }}</UBadge>
              </p>
              <p class="truncate text-[11px] text-dimmed">
                {{ likedGeneratedAt ? 'Maj ' + new Date(likedGeneratedAt).toLocaleString() : 'Snapshot non généré' }}
              </p>
            </div>
            <UTooltip text="Régénérer le snapshot">
              <UButton
                icon="i-lucide-rotate-ccw"
                color="neutral" variant="ghost" square
                class="ms-auto opacity-0 group-hover:opacity-100 transition-opacity"
                :loading="likedBusy"
                @click.stop="regenerateSnapshot"
              />
            </UTooltip>
          </button>
        </div>

        <div v-if="!loading && filteredPlaylists.length === 0" class="px-2 py-1.5 text-sm text-dimmed">
          Aucune playlist.
        </div>

        <div v-for="p in filteredPlaylists" :key="p.id" class="group relative">
          <button
            class="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left"
            @click="$emit('select-playlist', p.id)"
          >
            <img
              :src="p.images?.[0]?.url || 'https://via.placeholder.com/64x64?text=PL'"
              class="h-10 w-10 rounded object-cover shrink-0"
              alt=""
            />
            <div class="min-w-0">
              <p class="truncate text-sm">{{ p.name }}</p>
              <p class="truncate text-xs text-dimmed">
                {{ p.tracks?.total ?? 0 }} titres
                <span v-if="p.owner?.display_name"> · {{ p.owner.display_name }}</span>
              </p>
            </div>
            <UDropdownMenu
              :items="[
                [
                  { key: 'open',   label: 'Ouvrir',    icon: 'i-lucide-arrow-right' },
                  { key: 'play',   label: 'Lire',      icon: 'i-lucide-play',       disabled: actionBusy === p.id }
                ],
                [{ key: 'rename', label: 'Renommer',  icon: 'i-lucide-edit-3',     disabled: actionBusy === p.id }],
                [{ key: 'delete', label: 'Supprimer', icon: 'i-lucide-trash-2',    color: 'red', disabled: actionBusy === p.id }]
              ]"
              :content="{ align: 'end', sideOffset: 4 }"
            >
              <UButton
                icon="i-lucide-more-horizontal"
                color="neutral" variant="ghost" square
                class="ms-auto opacity-0 group-hover:opacity-100 transition-opacity"
                @click.stop
              />
              <template #item="{ item, close }">
                <button
                  class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-elevated/40 disabled:opacity-60"
                  :disabled="item.disabled"
                  @click.stop="() => {
                    if (item.key === 'open')   emit('select-playlist', p.id)
                    else if (item.key === 'play')   playPlaylist(p)
                    else if (item.key === 'rename') renamePlaylist(p)
                    else if (item.key === 'delete') deletePlaylist(p)
                    close()
                  }"
                >
                  <UIcon :name="item.icon" class="size-4" />
                  <span :class="item.color === 'red' ? 'text-red-500' : ''">{{ item.label }}</span>
                </button>
              </template>
            </UDropdownMenu>
          </button>
        </div>
      </template>

      <!-- ═══ ALBUMS ═══ -->
      <template v-else-if="active === 'albums'">
        <div v-if="loading && !albumsLoaded" class="space-y-2 px-1">
          <div v-for="i in 8" :key="i" class="flex items-center gap-3">
            <USkeleton class="h-10 w-10 rounded shrink-0" />
            <div class="flex-1 space-y-1.5">
              <USkeleton class="h-3.5 w-full" />
              <USkeleton class="h-3 w-2/3" />
            </div>
          </div>
        </div>

        <div v-else-if="filteredAlbums.length === 0" class="px-2 py-1.5 text-sm text-dimmed">
          Aucun album sauvegardé.
        </div>

        <button
          v-for="sa in filteredAlbums"
          :key="sa.album.id"
          class="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left"
          @click="$emit('select-album', sa.album.id)"
        >
          <img
            :src="sa.album.images?.[2]?.url || sa.album.images?.[1]?.url || sa.album.images?.[0]?.url || 'https://via.placeholder.com/40x40?text=AL'"
            class="h-10 w-10 rounded object-cover shrink-0"
            alt=""
          />
          <div class="min-w-0">
            <p class="truncate text-sm">{{ sa.album.name }}</p>
            <p class="truncate text-xs text-dimmed">
              {{ sa.album.artists.map(a => a.name).join(', ') }}
              <span v-if="albumYear(sa.album)"> · {{ albumYear(sa.album) }}</span>
            </p>
          </div>
        </button>
      </template>

      <!-- ═══ ARTISTES ═══ -->
      <template v-else-if="active === 'artists'">
        <div v-if="loading && !artistsLoaded" class="space-y-2 px-1">
          <div v-for="i in 8" :key="i" class="flex items-center gap-3">
            <USkeleton class="h-10 w-10 rounded-full shrink-0" />
            <div class="flex-1 space-y-1.5">
              <USkeleton class="h-3.5 w-3/4" />
              <USkeleton class="h-3 w-1/2" />
            </div>
          </div>
        </div>

        <div v-else-if="filteredArtists.length === 0" class="px-2 py-1.5 text-sm text-dimmed">
          Aucun artiste suivi.
        </div>

        <button
          v-for="ar in filteredArtists"
          :key="ar.id"
          class="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left"
          @click="$emit('select-artist', ar.id)"
        >
          <img
            :src="ar.images?.[2]?.url || ar.images?.[1]?.url || ar.images?.[0]?.url || 'https://via.placeholder.com/40x40?text=AR'"
            class="h-10 w-10 rounded-full object-cover shrink-0"
            alt=""
          />
          <div class="min-w-0">
            <p class="truncate text-sm">{{ ar.name }}</p>
            <p class="truncate text-xs text-dimmed">
              {{ ar.genres?.slice(0, 2).join(', ') || 'Artiste' }}
            </p>
          </div>
        </button>
      </template>

    </div>
  </aside>
</template>
