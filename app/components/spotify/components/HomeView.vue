<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import {
  search, getPlaylists, getAlbums, getArtists, getProviders,
  resolveId, resolveCoverUrl,
  type LibrarySource, type LibraryTrack, type LibraryPlaylist,
  type LibraryAlbum, type LibraryArtist, type SearchResult,
  type LibraryProvider
} from '@/src/api/library'
import HScroll from '@/components/spotify/components/HScroll.vue'

const props = withDefaults(defineProps<{ sources?: LibrarySource[] }>(), { sources: () => [] })

const emit = defineEmits<{
  (e: 'select-playlist', payload: LibraryPlaylist): void
  (e: 'select-album',    payload: LibraryAlbum): void
  (e: 'select-artist',   payload: LibraryArtist): void
  (e: 'enqueue-track',   track: LibraryTrack): void
  (e: 'play-track',      track: LibraryTrack): void
  (e: 'play-context',    payload: { source: LibrarySource; type: 'playlist' | 'album' | 'artist'; id: string; title?: string }): void
}>()

/** Émet une demande de lecture de contexte (playlist/album/artiste) */
function playCtx(item: any, type: 'playlist' | 'album' | 'artist') {
  emit('play-context', { source: item.source, type, id: resolveId(item), title: item.name })
}

const sourceLabel = (p: LibraryProvider) => p.name ?? p.id
const sourceIcon = (s?: LibrarySource) =>
  (s ?? '').toLowerCase() === 'spotify' ? 'mdi:spotify'
    : (s ?? '').toLowerCase() === 'fileplayer' ? 'mdi:file-music'
    : 'i-lucide-music'
const cover = (o: any) => resolveCoverUrl(o?.coverUrl ?? o?.cover_url ?? o?.image)
const trackCount = (o: any) => o?.trackCount ?? o?.track_count ?? null

/* ── Providers & filtre source ───────────────────────────────────────────── */
const providers      = ref<LibraryProvider[]>([])
const activeSources  = ref<LibrarySource[]>([])

/** Liste des sources à afficher en chips : providers de l'API, sinon dérivé des données */
const sourceChips = computed<LibraryProvider[]>(() => {
  if (providers.value.length) return providers.value
  const ids = new Set<LibrarySource>()
  for (const p of playlists.value) ids.add(p.source)
  for (const a of albums.value)    ids.add(a.source)
  for (const a of artists.value)   ids.add(a.source)
  return [...ids].map(id => ({ id, name: id } as LibraryProvider))
})

function toggleSource(id: LibrarySource) {
  const current = activeSources.value
  // Toggle indépendant : on (dés)active uniquement cette source.
  // Le filtrage est 100% client (computed) → instantané, pas de refetch.
  activeSources.value = current.includes(id)
    ? current.filter(s => s !== id)
    : [...current, id]
}

/* ── Recherche ───────────────────────────────────────────────────────────── */
const searchQuery   = ref('')
const searchLoading = ref(false)
const results       = ref<SearchResult>({})
const isSearching   = computed(() => searchQuery.value.trim().length > 0)

const doSearch = useDebounceFn(async (q: string) => {
  if (!q.trim()) { results.value = {}; return }
  searchLoading.value = true
  try { results.value = await search(q, { limit: 20 }) }
  finally { searchLoading.value = false }
}, 350)
watch(searchQuery, q => doSearch(q))

/* ── Sections home ───────────────────────────────────────────────────────── */
const loading   = ref(true)
const playlists = ref<LibraryPlaylist[]>([])
const albums    = ref<LibraryAlbum[]>([])
const artists   = ref<LibraryArtist[]>([])

/** Compare les sources sans tenir compte de la casse, et passe si source absente */
function matchSource(itemSource: string | undefined, active: LibrarySource[]) {
  if (!active.length) return true
  if (!itemSource)    return true   // pas de source → on affiche quand même
  return active.some(s => s.toLowerCase() === itemSource.toLowerCase())
}

/* Filtre côté client uniquement */
const filteredPlaylists = computed(() =>
  playlists.value.filter(p => matchSource(p.source, activeSources.value))
)
const filteredAlbums = computed(() =>
  albums.value.filter(a => matchSource(a.source, activeSources.value))
)
const filteredArtists = computed(() =>
  artists.value.filter(a => matchSource(a.source, activeSources.value))
)

/* Filtre résultats de recherche côté client */
const filteredResults = computed<SearchResult>(() => {
  if (!activeSources.value.length) return results.value
  return {
    tracks:    results.value.tracks?.filter(t => activeSources.value.includes(t.source)),
    albums:    results.value.albums?.filter(a => activeSources.value.includes(a.source)),
    artists:   results.value.artists?.filter(a => activeSources.value.includes(a.source)),
    playlists: results.value.playlists?.filter(p => activeSources.value.includes(p.source)),
  }
})

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
      getPlaylists({ limit: 100 }).catch(() => []),
      getAlbums({    limit: 100 }).catch(() => []),
      getArtists({   limit: 100 }).catch(() => []),
    ])
    playlists.value = pl
    albums.value    = al
    artists.value   = ar
  } finally { loading.value = false }
}

onMounted(async () => {
  // Charge d'abord les données sans filtre source
  await loadHome()
  // Puis charge les providers pour les chips (n'affecte pas le chargement)
  try {
    providers.value = await getProviders()
    activeSources.value = providers.value.map(p => p.id)
  } catch { /* chips indisponibles mais données déjà chargées */ }
})
</script>

<template>
  <div class="overflow-x-hidden">
    <!-- Barre de recherche + filtres sources (sticky) -->
    <div class="sticky top-0 z-30 px-3 sm:px-6 pt-3 pb-3 bg-elevated/80 backdrop-blur border-b border-default space-y-2">
      <UInput
        v-model="searchQuery" icon="i-lucide-search"
        placeholder="Titres, albums, artistes…" size="lg" class="w-full"
      >
        <template v-if="searchQuery" #trailing>
          <UButton
            icon="i-lucide-x" color="neutral" variant="link" size="sm" square
            aria-label="Effacer la recherche"
            @click="searchQuery = ''"
          />
        </template>
      </UInput>
      <!-- Chips de source -->
      <div v-if="sourceChips.length" class="flex items-center gap-1.5 flex-wrap">
        <span class="text-xs text-dimmed">Sources</span>
        <button
          v-for="p in sourceChips"
          :key="p.id"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
          :class="activeSources.includes(p.id)
            ? 'bg-primary text-inverted border-primary shadow-sm'
            : 'bg-transparent text-dimmed border-default hover:bg-elevated/60 opacity-60'"
          @click="toggleSource(p.id)"
        >
          <!-- ✓ visible quand actif -->
          <UIcon v-if="activeSources.includes(p.id)" name="i-lucide-check" class="size-3.5" />
          <!-- icônes statiques détectées par UnoCSS -->
          <UIcon v-else-if="p.id.toLowerCase() === 'spotify'"    name="mdi:spotify"     class="size-3.5" />
          <UIcon v-else-if="p.id.toLowerCase() === 'fileplayer'" name="mdi:file-music"  class="size-3.5" />
          <UIcon v-else                                          name="i-lucide-music"  class="size-3.5" />
          {{ sourceLabel(p) }}
        </button>
      </div>
    </div>

    <!-- ── Résultats de recherche ── -->
    <div v-if="isSearching" class="px-3 sm:px-6 py-4 sm:py-6 space-y-8">
      <div v-if="searchLoading" class="flex justify-center py-10">
        <UIcon name="i-lucide-loader-circle" class="size-8 text-dimmed animate-spin" />
      </div>
      <template v-else>
        <!-- Titres -->
        <section v-if="filteredResults.tracks?.length">
          <h2 class="text-lg font-bold mb-3">Titres</h2>
          <div class="space-y-1">
            <div v-for="(t, i) in filteredResults.tracks" :key="t.sourceId ?? t.uri ?? i" class="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-accented transition-colors">
              <img v-if="cover(t)" :src="cover(t)" class="h-10 w-10 rounded object-cover shrink-0" alt="" />
              <div v-else class="h-10 w-10 rounded bg-elevated flex items-center justify-center shrink-0"><UIcon :name="sourceIcon(t.source)" class="size-4 text-dimmed" /></div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">{{ t.title }}</p>
                <p class="text-xs text-dimmed truncate">{{ t.artists?.join(', ') }}</p>
              </div>
              <UButton icon="i-lucide-play" size="xs" color="primary" variant="solid" square class="shrink-0" @click="emit('play-track', t)" />
              <UButton icon="i-lucide-list-plus" size="xs" color="neutral" variant="soft" square class="shrink-0" @click="emit('enqueue-track', t)" />
            </div>
          </div>
        </section>

        <!-- Albums -->
        <section v-if="filteredResults.albums?.length">
          <h2 class="text-lg font-bold mb-3">Albums</h2>
          <HScroll>
            <div v-for="a in filteredResults.albums" :key="a.id" class="group shrink-0 w-28 sm:w-36 cursor-pointer" @click="emit('select-album', a)">
              <div class="relative rounded-md overflow-hidden mb-2 h-28 w-28 sm:h-36 sm:w-36 bg-elevated">
                <img v-if="cover(a)" :src="cover(a)" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-disc-3" class="size-8 text-dimmed" /></div>
                <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(a, 'album')" />
              </div>
              <p class="text-xs font-semibold truncate">{{ a.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ a.artists?.join(', ') }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Artistes -->
        <section v-if="filteredResults.artists?.length">
          <h2 class="text-lg font-bold mb-3">Artistes</h2>
          <HScroll>
            <div v-for="ar in filteredResults.artists" :key="ar.id" class="group shrink-0 w-28 sm:w-36 cursor-pointer text-center" @click="emit('select-artist', ar)">
              <div class="relative h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden mb-2 mx-auto bg-elevated">
                <img v-if="cover(ar)" :src="cover(ar)" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-user-round" class="size-7 text-dimmed" /></div>
                <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(ar, 'artist')" />
              </div>
              <p class="text-xs font-semibold truncate">{{ ar.name }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Playlists -->
        <section v-if="filteredResults.playlists?.length">
          <h2 class="text-lg font-bold mb-3">Playlists</h2>
          <HScroll>
            <div v-for="p in filteredResults.playlists" :key="p.id" class="group shrink-0 w-28 sm:w-36 cursor-pointer" @click="emit('select-playlist', p)">
              <div class="relative rounded-md overflow-hidden mb-2 h-28 w-28 sm:h-36 sm:w-36 bg-elevated">
                <img v-if="cover(p)" :src="cover(p)" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-list-music" class="size-8 text-dimmed" /></div>
                <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(p, 'playlist')" />
              </div>
              <p class="text-xs font-semibold truncate">{{ p.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ p.source }}</p>
            </div>
          </HScroll>
        </section>

        <div v-if="!filteredResults.tracks?.length && !filteredResults.albums?.length && !filteredResults.artists?.length && !filteredResults.playlists?.length" class="text-center py-16 text-dimmed">
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
        <section v-if="filteredPlaylists.length">
          <h2 class="text-xl font-bold mb-3">Playlists</h2>
          <HScroll>
            <div v-for="p in filteredPlaylists" :key="p.source + p.id" class="group shrink-0 w-28 cursor-pointer" @click="emit('select-playlist', p)">
              <div class="relative h-28 w-28 rounded-md overflow-hidden mb-2 bg-elevated">
                <img v-if="cover(p)" :src="cover(p)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-list-music" class="size-8 text-dimmed" /></div>
                <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(p, 'playlist')" />
              </div>
              <p class="text-sm font-semibold truncate">{{ p.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ trackCount(p) ? trackCount(p) + ' titres' : p.source }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Albums -->
        <section v-if="filteredAlbums.length">
          <h2 class="text-xl font-bold mb-3">Albums</h2>
          <HScroll>
            <div v-for="a in filteredAlbums" :key="a.source + resolveId(a)" class="group shrink-0 w-28 cursor-pointer" @click="emit('select-album', a)">
              <div class="relative h-28 w-28 rounded-md overflow-hidden mb-2 bg-elevated">
                <img v-if="cover(a)" :src="cover(a)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-disc-3" class="size-8 text-dimmed" /></div>
                <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(a, 'album')" />
              </div>
              <p class="text-sm font-semibold truncate">{{ a.name }}</p>
              <p class="text-xs text-dimmed truncate">{{ a.artists?.join(', ') }}</p>
            </div>
          </HScroll>
        </section>

        <!-- Artistes -->
        <section v-if="filteredArtists.length">
          <h2 class="text-xl font-bold mb-3">Artistes</h2>
          <HScroll>
            <div v-for="ar in filteredArtists" :key="ar.source + resolveId(ar)" class="group shrink-0 w-28 cursor-pointer text-center" @click="emit('select-artist', ar)">
              <div class="relative h-28 w-28 rounded-full overflow-hidden mb-2 mx-auto bg-elevated">
                <img v-if="cover(ar)" :src="cover(ar)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-user-round" class="size-8 text-dimmed" /></div>
                <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(ar, 'artist')" />
              </div>
              <p class="text-sm font-semibold truncate">{{ ar.name }}</p>
            </div>
          </HScroll>
        </section>

        <div v-if="!filteredPlaylists.length && !filteredAlbums.length && !filteredArtists.length" class="text-center py-16 text-dimmed">
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
