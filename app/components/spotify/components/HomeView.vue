<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import {
  search, getPlaylists, getAlbums, getArtists,
  type LibrarySource, type LibraryTrack, type LibraryPlaylist,
  type LibraryAlbum, type LibraryArtist, type SearchResult
} from '@/src/api/library'
import HScroll from '@/components/spotify/components/HScroll.vue'

const props = withDefaults(defineProps<{ sources?: LibrarySource[] }>(), { sources: () => [] })

const emit = defineEmits<{
  (e: 'select-playlist', payload: LibraryPlaylist): void
  (e: 'select-album',    payload: LibraryAlbum): void
  (e: 'select-artist',   payload: LibraryArtist): void
  (e: 'enqueue-track',   track: LibraryTrack): void
}>()

const sourceIcon = (s?: LibrarySource) =>
  s === 'spotify' ? 'mdi:spotify' : s === 'fileplayer' ? 'mdi:file-music' : 'i-lucide-music'
const cover = (o: any) => o?.coverUrl ?? o?.cover_url ?? o?.image ?? null
const trackCount = (o: any) => o?.trackCount ?? o?.track_count ?? null

/* ── Recherche ───────────────────────────────────────────────────────────── */
const searchQuery   = ref('')
const searchLoading = ref(false)
const results       = ref<SearchResult>({})
const isSearching   = computed(() => searchQuery.value.trim().length > 0)

const doSearch = useDebounceFn(async (q: string) => {
  if (!q.trim()) { results.value = {}; return }
  searchLoading.value = true
  try { results.value = await search(q, { sources: props.sources, limit: 20 }) }
  finally { searchLoading.value = false }
}, 350)
watch(searchQuery, q => doSearch(q))

/* ── Sections home ───────────────────────────────────────────────────────── */
const loading   = ref(true)
const playlists = ref<LibraryPlaylist[]>([])
const albums    = ref<LibraryAlbum[]>([])
const artists   = ref<LibraryArtist[]>([])

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bonne après-midi'
  return 'Bonsoir'
})

async function loadHome() {
  loading.value = true
  try {
    const [pl, al, ar] = await Promise.all([
      getPlaylists({ sources: props.sources, limit: 20 }).catch(() => []),
      getAlbums({ sources: props.sources, limit: 20 }).catch(() => []),
      getArtists({ sources: props.sources, limit: 20 }).catch(() => []),
    ])
    playlists.value = pl
    albums.value    = al
    artists.value   = ar
  } finally { loading.value = false }
}

watch(() => props.sources, loadHome, { deep: true })
onMounted(loadHome)
</script>

<template>
  <div class="overflow-x-hidden">
    <!-- Barre de recherche sticky -->
    <div class="sticky top-0 z-30 px-3 sm:px-6 pt-4 pb-3 bg-elevated/80 backdrop-blur border-b border-default">
      <UInput
        v-model="searchQuery" icon="i-lucide-search"
        placeholder="Titres, albums, artistes…" size="lg" class="w-full"
        :trailing-icon="searchQuery ? 'i-lucide-x' : undefined"
        @click:trailing="searchQuery = ''"
      />
    </div>

    <!-- ── Résultats de recherche ── -->
    <div v-if="isSearching" class="px-3 sm:px-6 py-4 sm:py-6 space-y-8">
      <div v-if="searchLoading" class="flex justify-center py-10">
        <UIcon name="i-lucide-loader-circle" class="size-8 text-dimmed animate-spin" />
      </div>
      <template v-else>
        <!-- Titres -->
        <section v-if="results.tracks?.length">
          <h2 class="text-lg font-bold mb-3">Titres</h2>
          <div class="space-y-1">
            <div v-for="(t, i) in results.tracks" :key="t.sourceId ?? t.uri ?? i" class="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-accented transition-colors">
              <img v-if="cover(t)" :src="cover(t)" class="h-10 w-10 rounded object-cover shrink-0" alt="" />
              <div v-else class="h-10 w-10 rounded bg-elevated flex items-center justify-center shrink-0"><UIcon :name="sourceIcon(t.source)" class="size-4 text-dimmed" /></div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">{{ t.title }}</p>
                <p class="text-xs text-dimmed truncate">{{ t.artists?.join(', ') }}</p>
              </div>
              <UButton icon="i-lucide-list-plus" size="xs" color="primary" variant="soft" square class="shrink-0" @click="emit('enqueue-track', t)" />
            </div>
          </div>
        </section>

        <!-- Albums -->
        <section v-if="results.albums?.length">
          <h2 class="text-lg font-bold mb-3">Albums</h2>
          <HScroll>
            <div v-for="a in results.albums" :key="a.id" class="group shrink-0 w-28 sm:w-36 cursor-pointer" @click="emit('select-album', a)">
              <div class="rounded-md overflow-hidden mb-2 h-28 w-28 sm:h-36 sm:w-36 bg-elevated">
                <img v-if="cover(a)" :src="cover(a)" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-disc-3" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-xs font-semibold truncate">{{ a.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ a.artists?.join(', ') }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Artistes -->
        <section v-if="results.artists?.length">
          <h2 class="text-lg font-bold mb-3">Artistes</h2>
          <HScroll>
            <div v-for="ar in results.artists" :key="ar.id" class="group shrink-0 w-28 sm:w-36 cursor-pointer text-center" @click="emit('select-artist', ar)">
              <div class="h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden mb-2 mx-auto bg-elevated">
                <img v-if="cover(ar)" :src="cover(ar)" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-user-round" class="size-7 text-dimmed" /></div>
              </div>
              <p class="text-xs font-semibold truncate">{{ ar.name }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Playlists -->
        <section v-if="results.playlists?.length">
          <h2 class="text-lg font-bold mb-3">Playlists</h2>
          <HScroll>
            <div v-for="p in results.playlists" :key="p.id" class="group shrink-0 w-28 sm:w-36 cursor-pointer" @click="emit('select-playlist', p)">
              <div class="rounded-md overflow-hidden mb-2 h-28 w-28 sm:h-36 sm:w-36 bg-elevated">
                <img v-if="cover(p)" :src="cover(p)" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-list-music" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-xs font-semibold truncate">{{ p.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ p.source }}</p>
            </div>
          </HScroll>
        </section>

        <div v-if="!results.tracks?.length && !results.albums?.length && !results.artists?.length && !results.playlists?.length" class="text-center py-16 text-dimmed">
          <UIcon name="i-lucide-search-x" class="size-12 mx-auto mb-3 opacity-40" />
          <p>Aucun résultat pour « {{ searchQuery }} »</p>
        </div>
      </template>
    </div>

    <!-- ── Home (hors recherche) ── -->
    <div v-else class="space-y-8 px-3 sm:px-6 pt-4 sm:pt-8 pb-8">
      <h1 class="text-xl sm:text-3xl font-bold">{{ greeting }}</h1>

      <template v-if="loading">
        <section v-for="s in 3" :key="s">
          <USkeleton class="h-6 w-40 mb-3" />
          <div class="flex gap-4">
            <div v-for="i in 6" :key="i" class="shrink-0 space-y-2">
              <USkeleton class="h-28 w-28 rounded-md" />
              <USkeleton class="h-4 w-24" />
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <!-- Playlists -->
        <section v-if="playlists.length">
          <h2 class="text-xl font-bold mb-3">Playlists</h2>
          <HScroll>
            <div v-for="p in playlists" :key="p.source + p.id" class="group shrink-0 w-28 cursor-pointer" @click="emit('select-playlist', p)">
              <div class="h-28 w-28 rounded-md overflow-hidden mb-2 bg-elevated">
                <img v-if="cover(p)" :src="cover(p)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-list-music" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-sm font-semibold truncate">{{ p.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ trackCount(p) ? trackCount(p) + ' titres' : p.source }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Albums -->
        <section v-if="albums.length">
          <h2 class="text-xl font-bold mb-3">Albums</h2>
          <HScroll>
            <div v-for="a in albums" :key="a.source + a.id" class="group shrink-0 w-28 cursor-pointer" @click="emit('select-album', a)">
              <div class="h-28 w-28 rounded-md overflow-hidden mb-2 bg-elevated">
                <img v-if="cover(a)" :src="cover(a)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-disc-3" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-sm font-semibold truncate">{{ a.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ a.artists?.join(', ') }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Artistes -->
        <section v-if="artists.length">
          <h2 class="text-xl font-bold mb-3">Artistes</h2>
          <HScroll>
            <div v-for="ar in artists" :key="ar.source + ar.id" class="group shrink-0 w-28 cursor-pointer text-center" @click="emit('select-artist', ar)">
              <div class="h-28 w-28 rounded-full overflow-hidden mb-2 mx-auto bg-elevated">
                <img v-if="cover(ar)" :src="cover(ar)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-user-round" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-sm font-semibold truncate">{{ ar.name }}</p>
            </div>
          </HScroll>
        </section>

        <div v-if="!playlists.length && !albums.length && !artists.length" class="text-center py-16 text-dimmed">
          <UIcon name="i-lucide-music" class="size-12 mx-auto mb-3 opacity-40" />
          <p>Bibliothèque vide — lancez une réindexation.</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.scroll-thin { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
.scroll-thin::-webkit-scrollbar { height: 4px; }
.scroll-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
</style>
