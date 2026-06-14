<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import {
  getProviders, getPlaylists, getAlbums, getArtists, reindex, resolveCoverUrl, resolveId,
  type LibrarySource, type LibraryProvider,
  type LibraryPlaylist, type LibraryAlbum, type LibraryArtist
} from '@/src/api/library'

const { menue } = useDashboard()

withDefaults(defineProps<{
  headerHeight?: number
  playerHeight?: number
}>(), { headerHeight: 92, playerHeight: 110 })

const emit = defineEmits<{
  (e: 'select-playlist', payload: LibraryPlaylist): void
  (e: 'select-album',    payload: LibraryAlbum): void
  (e: 'select-artist',   payload: LibraryArtist): void
  (e: 'play-context',    payload: { source: LibrarySource; type: 'playlist' | 'album' | 'artist'; id: string; title?: string }): void
  (e: 'refresh'): void
}>()

function playCtx(item: any, type: 'playlist' | 'album' | 'artist') {
  emit('play-context', { source: item.source, type, id: resolveId(item), title: item.name })
}

/* ── Sources ─────────────────────────────────────────────────────────────── */
const providers       = ref<LibraryProvider[]>([])
const selectedSources = ref<LibrarySource[]>([])
const reindexing      = ref(false)

async function loadProviders() {
  try {
    providers.value = (await getProviders()).filter(p => p.active !== false)
    selectedSources.value = providers.value.map(p => p.id)
  } catch { /* noop */ }
}
function toggleSource(id: LibrarySource) {
  selectedSources.value = selectedSources.value.includes(id)
    ? selectedSources.value.filter(s => s !== id)
    : [...selectedSources.value, id]
  reload()
}
async function onReindex() {
  reindexing.value = true
  try { await reindex() } finally { reindexing.value = false; reload() }
}
const sourceIcon = (s?: LibrarySource) =>
  s === 'spotify' ? 'mdi:spotify' : s === 'fileplayer' ? 'mdi:file-music' : 'i-lucide-music'

/* ── Onglets ─────────────────────────────────────────────────────────────── */
type Section = 'playlists' | 'albums' | 'artists'
const sections: { key: Section; label: string; icon: string }[] = [
  { key: 'playlists', label: 'Playlists', icon: 'i-lucide-list-music' },
  { key: 'albums',    label: 'Albums',    icon: 'i-lucide-disc-3'     },
  { key: 'artists',   label: 'Artistes',  icon: 'i-lucide-mic-2'      }
]
const active = ref<Section>('playlists')

/* ── State ───────────────────────────────────────────────────────────────── */
const loading  = ref(false)
const q        = ref('')
const playlists = ref<LibraryPlaylist[]>([])
const albums    = ref<LibraryAlbum[]>([])
const artists   = ref<LibraryArtist[]>([])

async function loadPlaylists() {
  loading.value = true
  try { playlists.value = await getPlaylists({ q: q.value || undefined, sources: selectedSources.value, limit: 100 }) }
  finally { loading.value = false }
}
async function loadAlbums() {
  loading.value = true
  try { albums.value = await getAlbums({ q: q.value || undefined, sources: selectedSources.value, limit: 100 }) }
  finally { loading.value = false }
}
async function loadArtists() {
  loading.value = true
  try { artists.value = await getArtists({ q: q.value || undefined, sources: selectedSources.value, limit: 100 }) }
  finally { loading.value = false }
}

function reload() {
  if (active.value === 'playlists') loadPlaylists()
  if (active.value === 'albums')    loadAlbums()
  if (active.value === 'artists')   loadArtists()
}

const _searchDebounced = useDebounceFn(reload, 300)
watch(q, () => _searchDebounced())
watch(active, reload)

function onRefresh() { emit('refresh'); reload() }

const cover = (o: any) => resolveCoverUrl(o.coverUrl ?? o.cover_url ?? o.image) ?? 'https://via.placeholder.com/64x64?text=♪'
const trackCount = (o: any) => o.trackCount ?? o.track_count ?? null

onMounted(async () => {
  await loadProviders()
  await loadPlaylists()
})
</script>

<template>
  <aside class="w-72 shrink-0 border-r border-default bg-elevated/30 flex flex-col h-full">

    <!-- HEADER sticky -->
    <div class="sticky top-0 z-10 bg-elevated/60 backdrop-blur border-b border-default">
      <div class="px-3 pt-3 flex items-center gap-2">
        <UTooltip text="Menu">
          <UButton icon="i-lucide:menu" color="neutral" variant="ghost" square @click="menue = !menue" />
        </UTooltip>
        <UInput v-model="q" placeholder="Rechercher…" icon="i-lucide-search" class="flex-1" />
        <UTooltip text="Réindexer">
          <UButton icon="i-lucide-refresh-ccw" color="neutral" variant="ghost" square :loading="reindexing || loading" @click="onReindex" />
        </UTooltip>
      </div>

      <!-- Sources -->
      <div class="px-3 pt-2 flex items-center gap-2 flex-wrap">
        <UButton
          v-for="p in providers" :key="p.id"
          size="xs"
          square
          class=""
          style="padding: 3px"
          :color="selectedSources.includes(p.id) ? 'primary' : 'neutral'"
          :variant="selectedSources.includes(p.id) ? 'solid' : 'soft'"
          :icon="sourceIcon(p.id)"
          :ui="{ leadingIcon: 'size-5' }"
          @click="toggleSource(p.id)"
        />
      </div>

      <!-- Onglets -->
      <div class="px-2 pt-2 pb-2">
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="s in sections" :key="s.key"
            class="flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs hover:bg-elevated/50 transition-colors"
            :class="active === s.key ? 'bg-elevated/70 text-highlighted' : 'text-dimmed'"
            @click="active = s.key"
          >
            <UIcon :name="s.icon" class="size-4" />
            <span class="truncate">{{ s.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- CORPS scrollable -->
    <div class="p-2 overflow-y-auto flex-1 min-h-0">

      <!-- PLAYLISTS -->
      <template v-if="active === 'playlists'">
        <div v-if="!loading && !playlists.length" class="px-2 py-1.5 text-sm text-dimmed">Aucune playlist.</div>
        <div
          v-for="p in playlists" :key="p.source + p.id"
          class="group w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left cursor-pointer"
          @click="emit('select-playlist', p)"
        >
          <img :src="cover(p)" class="h-10 w-10 rounded object-cover shrink-0" alt="" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{{ p.name }}</p>
            <p class="truncate text-xs text-dimmed">{{ trackCount(p) ? trackCount(p) + ' titres' : p.source }}</p>
          </div>
          <UIcon :name="sourceIcon(p.source)" class="size-3.5 text-dimmed shrink-0" />
          <UButton icon="i-lucide-play" size="2xs" color="primary" square class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop="playCtx(p, 'playlist')" />
        </div>
      </template>

      <!-- ALBUMS -->
      <template v-else-if="active === 'albums'">
        <div v-if="!loading && !albums.length" class="px-2 py-1.5 text-sm text-dimmed">Aucun album.</div>
        <div
          v-for="a in albums" :key="a.source + a.id"
          class="group w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left cursor-pointer"
          @click="emit('select-album', a)"
        >
          <img :src="cover(a)" class="h-10 w-10 rounded object-cover shrink-0" alt="" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{{ a.name }}</p>
            <p class="truncate text-xs text-dimmed">{{ a.artists?.join(', ') }}<span v-if="a.year"> · {{ a.year }}</span></p>
          </div>
          <UIcon :name="sourceIcon(a.source)" class="size-3.5 text-dimmed shrink-0" />
          <UButton icon="i-lucide-play" size="2xs" color="primary" square class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop="playCtx(a, 'album')" />
        </div>
      </template>

      <!-- ARTISTES -->
      <template v-else-if="active === 'artists'">
        <div v-if="!loading && !artists.length" class="px-2 py-1.5 text-sm text-dimmed">Aucun artiste.</div>
        <div
          v-for="ar in artists" :key="ar.source + ar.id"
          class="group w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left cursor-pointer"
          @click="emit('select-artist', ar)"
        >
          <img :src="cover(ar)" class="h-10 w-10 rounded-full object-cover shrink-0" alt="" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{{ ar.name }}</p>
            <p class="truncate text-xs text-dimmed">{{ ar.source }}</p>
          </div>
          <UIcon :name="sourceIcon(ar.source)" class="size-3.5 text-dimmed shrink-0" />
          <UButton icon="i-lucide-play" size="2xs" color="primary" square class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop="playCtx(ar, 'artist')" />
        </div>
      </template>

      <div v-if="loading" class="flex justify-center py-4">
        <UIcon name="i-lucide-loader-circle" class="animate-spin text-dimmed size-5" />
      </div>
    </div>
  </aside>
</template>
