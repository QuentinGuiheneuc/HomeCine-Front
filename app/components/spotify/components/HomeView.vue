<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import {
  search, getPlaylistsPage, getAlbumsPage, getArtistsPage, getProviders, getCategories,
  resolveId, coverOf as cover,
  type LibrarySource, type LibraryTrack, type LibraryPlaylist,
  type LibraryAlbum, type LibraryArtist, type LibraryCategory, type SearchResult,
  type LibraryProvider
} from '@/src/api/library'
import { getGenres, type Genre } from '@/src/api/genres'
import { importDbPlaylist, createDbPlaylist } from '@/src/api/dbPlaylists'
import HScroll from '@/components/spotify/components/HScroll.vue'
import { useLibrarySources } from '@/composables/useLibrarySources'

const toast = useToast()

const props = withDefaults(defineProps<{ sources?: LibrarySource[]; currentKey?: string }>(), { sources: () => [] })

const emit = defineEmits<{
  (e: 'select-playlist', payload: LibraryPlaylist): void
  (e: 'select-album',    payload: LibraryAlbum): void
  (e: 'select-artist',   payload: LibraryArtist): void
  (e: 'enqueue-track',   track: LibraryTrack): void
  (e: 'play-track',      track: LibraryTrack): void
  (e: 'add-to-playlist', track: LibraryTrack): void
  (e: 'download-track',  track: LibraryTrack): void
  (e: 'save-track',      track: LibraryTrack): void
  (e: 'follow-artist',   artist: LibraryArtist): void
  (e: 'play-context',    payload: { source: LibrarySource; type: 'playlist' | 'album' | 'artist'; id: string; title?: string; kind?: string }): void
  (e: 'select-category', payload: LibraryCategory): void
  (e: 'select-genre',    genre: Genre): void
  (e: 'open-trackliste'): void
}>()

/** Émet une demande de lecture de contexte (playlist/album/artiste) */
function playCtx(item: any, type: 'playlist' | 'album' | 'artist') {
  emit('play-context', { source: item.source, type, id: resolveId(item), title: item.name, kind: item.kind })
}

/** Sections dépliées (affichage grille complète) */
const expanded = ref<Record<'playlists' | 'albums' | 'artists' | 'folders' | 'categories', boolean>>({
  playlists: false, albums: false, artists: false, folders: false, categories: false,
})

const sourceLabel = (p: LibraryProvider) => p.name ?? p.id
const trackCount = (o: any) => o?.trackCount ?? o?.track_count ?? null

/* ── Providers & filtre source (persisté + partagé) ──────────────────────── */
const providers = ref<LibraryProvider[]>([])
const { sources: activeSources, toggle: toggleSrc, initIfEmpty } = useLibrarySources()

/** Liste des sources à afficher en chips : providers de l'API, sinon dérivé des données */
const sourceChips = computed<LibraryProvider[]>(() => {
  if (providers.value.length) return providers.value
  const ids = new Set<LibrarySource>()
  for (const p of playlists.value) ids.add(p.source)
  for (const a of albums.value)    ids.add(a.source)
  for (const a of artists.value)   ids.add(a.source)
  return [...ids].map(id => ({ id, name: id } as LibraryProvider))
})

/** Sources à envoyer à l'API (undefined = toutes) */
const apiSources = () => activeSources.value.length ? activeSources.value : undefined

function toggleSource(id: LibrarySource) {
  toggleSrc(id)   // le watcher sur activeSources déclenche le refetch
}

/* ── Recherche ───────────────────────────────────────────────────────────── */
const searchQuery   = ref('')
const searchLoading = ref(false)
const results       = ref<SearchResult>({})
const isSearching   = computed(() => searchQuery.value.trim().length > 0)
const SEARCH_PAGE   = 10
const searchPage    = ref(1)
const searchHasMore = ref(false)
const searchMore    = ref(false)

/* Pagination par section (albums / artistes / playlists) — même principe que les titres */
type SearchSection = 'albums' | 'artists' | 'playlists'
const secPage    = ref<Record<SearchSection, number>>({ albums: 1, artists: 1, playlists: 1 })
const secHasMore = ref<Record<SearchSection, boolean>>({ albums: false, artists: false, playlists: false })
const secLoading = ref<Record<SearchSection, boolean>>({ albums: false, artists: false, playlists: false })

const doSearch = useDebounceFn(async (q: string) => {
  if (!q.trim()) {
    results.value = {}
    searchHasMore.value = false
    secHasMore.value = { albums: false, artists: false, playlists: false }
    return
  }
  searchLoading.value = true
  searchPage.value = 1
  secPage.value = { albums: 1, artists: 1, playlists: 1 }
  try {
    const r = await search(q, { sources: apiSources(), page: 1, pageSize: SEARCH_PAGE })
    results.value = r
    searchHasMore.value = !!r.hasMore
    // L'API ne renvoie hasMore que pour les pistes → on propose « Charger plus »
    // dès qu'une section a des résultats ; le bouton disparaît si la page suivante
    // n'apporte rien de nouveau (cf. loadMoreSection).
    secHasMore.value = {
      albums:    (r.albums?.length    ?? 0) > 0,
      artists:   (r.artists?.length   ?? 0) > 0,
      playlists: (r.playlists?.length ?? 0) > 0,
    }
  } finally { searchLoading.value = false }
}, 350)

/** Charge la page suivante d'une section (albums / artistes / playlists) */
async function loadMoreSection(sec: SearchSection) {
  if (!secHasMore.value[sec] || secLoading.value[sec]) return
  secLoading.value[sec] = true
  try {
    const next = secPage.value[sec] + 1
    const r = await search(searchQuery.value, { sources: apiSources(), page: next, pageSize: SEARCH_PAGE })
    const current  = (results.value[sec] ?? []) as any[]
    const incoming = (r[sec] ?? []) as any[]
    // Anti-doublons : si l'API ne pagine pas cette section, on reçoit les mêmes items
    const key  = (o: any) => `${o?.source ?? ''}:${o?.id ?? o?.uri ?? o?.name ?? ''}`
    const seen = new Set(current.map(key))
    const fresh = incoming.filter(o => !seen.has(key(o)))
    if (fresh.length) results.value = { ...results.value, [sec]: [...current, ...fresh] }
    secPage.value[sec] = next
    secHasMore.value[sec] = fresh.length > 0   // rien de neuf → plus rien à charger
  } catch { /* noop */ }
  finally { secLoading.value[sec] = false }
}

/** Charge la page suivante de résultats (pistes) et l'ajoute */
async function loadMoreSearch() {
  if (!searchHasMore.value || searchMore.value) return
  searchMore.value = true
  try {
    const next = searchPage.value + 1
    const r = await search(searchQuery.value, { sources: apiSources(), page: next, pageSize: SEARCH_PAGE })
    results.value = { ...results.value, tracks: [...(results.value.tracks ?? []), ...(r.tracks ?? [])] }
    searchPage.value = next
    searchHasMore.value = !!r.hasMore
  } catch { /* noop */ }
  finally { searchMore.value = false }
}
watch(searchQuery, q => doSearch(q))
/* Refetch quand les sources changent (depuis la home OU la sidebar) */
watch(activeSources, () => { isSearching.value ? doSearch(searchQuery.value) : loadHome() }, { deep: true })

/* ── Sections home ───────────────────────────────────────────────────────── */
const loading   = ref(true)
const playlists = ref<LibraryPlaylist[]>([])
const albums    = ref<LibraryAlbum[]>([])
const artists   = ref<LibraryArtist[]>([])
const folders   = ref<LibraryCategory[]>([])
const genres    = ref<Genre[]>([])

/** Genres valides : nom non vide, dédoublonnés par nom (insensible à la casse) */
const genreChips = computed(() => {
  const seen = new Set<string>()
  return genres.value.filter(g => {
    const name = (g.name ?? '').trim()
    if (!name) return false
    const key = name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

/* Filtrage côté serveur (via le paramètre sources) → on affiche les listes brutes.
   Important : la réponse peut contenir des items DB (source:"playlist") qu'il ne
   faut pas re-filtrer côté client. */
const filteredPlaylists = computed(() => playlists.value)
const filteredAlbums    = computed(() => albums.value)
const filteredArtists   = computed(() => artists.value)
const filteredResults   = computed<SearchResult>(() => results.value)

/* Les trois rangees de l'accueil (playlists, albums, artistes) partagent la meme carte :
   seuls ces champs changent. */
type HomeItem = LibraryPlaylist | LibraryAlbum | LibraryArtist
type HomeRow = {
  key: HomeSection
  title: string
  items: HomeItem[]
  type: 'playlist' | 'album' | 'artist'
  icon: string
  round: boolean
  select: (x: HomeItem) => void
}
const homeSections = computed<HomeRow[]>(() => [
  {
    key: 'playlists', title: 'Playlists', items: filteredPlaylists.value, type: 'playlist',
    icon: 'i-lucide-list-music', round: false, select: x => emit('select-playlist', x as LibraryPlaylist)
  },
  {
    key: 'albums', title: 'Albums', items: filteredAlbums.value, type: 'album',
    icon: 'i-lucide-disc-3', round: false, select: x => emit('select-album', x as LibraryAlbum)
  },
  {
    key: 'artists', title: 'Artistes', items: filteredArtists.value, type: 'artist',
    icon: 'i-lucide-user-round', round: true, select: x => emit('select-artist', x as LibraryArtist)
  }
])

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bonne après-midi'
  return 'Bonsoir'
})

/* Pagination des sections de la home (1re page + « Charger plus ») */
type HomeSection = 'playlists' | 'albums' | 'artists'
const homePage    = ref<Record<HomeSection, number>>({ playlists: 1, albums: 1, artists: 1 })
const homeHasMore = ref<Record<HomeSection, boolean>>({ playlists: false, albums: false, artists: false })
const homeLoading = ref<Record<HomeSection, boolean>>({ playlists: false, albums: false, artists: false })

const homeFetchers = {
  playlists: (pg: number) => getPlaylistsPage({ sources: apiSources(), page: pg }),
  albums:    (pg: number) => getAlbumsPage({    sources: apiSources(), page: pg }),
  artists:   (pg: number) => getArtistsPage({   sources: apiSources(), page: pg }),
} as const

const homeList = (sec: HomeSection) => (sec === 'playlists' ? playlists : sec === 'albums' ? albums : artists)

/** Pages chargées d'entrée pour Playlists / Albums / Artistes */
const INITIAL_PAGES = 2

/** Récupère les premières pages d'une section */
async function firstPages(sec: HomeSection) {
  const items: any[] = []
  let loaded = 0, hasMore = false
  for (let pg = 1; pg <= INITIAL_PAGES; pg++) {
    const res = await homeFetchers[sec](pg)
    items.push(...res.items)
    loaded = pg
    hasMore = res.hasMore
    if (!hasMore) break
  }
  return { items, page: loaded, hasMore }
}

/** Charge la page suivante d'une section et l'ajoute */
async function loadMoreHome(sec: HomeSection) {
  if (!homeHasMore.value[sec] || homeLoading.value[sec]) return
  homeLoading.value[sec] = true
  try {
    const next = homePage.value[sec] + 1
    const res = await homeFetchers[sec](next)
    ;(homeList(sec).value as any[]) = [...(homeList(sec).value as any[]), ...res.items]
    homePage.value[sec] = next
    homeHasMore.value[sec] = res.hasMore
  } catch { /* noop */ }
  finally { homeLoading.value[sec] = false }
}

async function loadHome() {
  loading.value = true
  try {
    const sources = apiSources()
    const empty = { items: [] as any[], page: 1, hasMore: false }
    const [pl, al, ar, fo, ge] = await Promise.all([
      firstPages('playlists').catch(() => empty),
      firstPages('albums').catch(() => empty),
      firstPages('artists').catch(() => empty),
      // Passer les sources actives n'est pas qu'un filtre : getAllPages ne
      // déroule la pagination que si `fileplayer` y figure (source locale, sans
      // quota). Sans ce paramètre on s'arrêtait à la 1re page, soit 10 dossiers.
      getCategories({ sources: sources }).catch(() => []),
      getGenres().catch(() => []),
    ])
    playlists.value = pl.items as any[]
    albums.value    = al.items as any[]
    artists.value   = ar.items as any[]
    homePage.value    = { playlists: pl.page, albums: al.page, artists: ar.page }
    homeHasMore.value = { playlists: pl.hasMore, albums: al.hasMore, artists: ar.hasMore }
    // Filtre de ceinture : l'API reçoit déjà `sources`, mais sans ce garde un
    // serveur qui ignorerait le paramètre réinjecterait le catalogue de genres
    // Deezer parmi les dossiers.
    folders.value   = (fo as any[]).filter(f => activeSources.value.includes(f.source))
    genres.value    = ge
  } finally { loading.value = false }
}

/* ── Import d'une playlist par URL (ex: YouTube) ─────────────────────────── */
const importOpen   = ref(false)
const importUrl    = ref('')
const importName   = ref('')
const importSource = ref<LibrarySource>('youtube')
const importing    = ref(false)

const importSourceItems = computed(() =>
  (sourceChips.value.length ? sourceChips.value : providers.value).map(p => ({ label: sourceLabel(p), value: p.id })),
)

function openImport() {
  importUrl.value = ''
  importName.value = ''
  importSource.value = (providers.value.find(p => p.id === 'youtube')?.id ?? providers.value[0]?.id ?? 'youtube') as LibrarySource
  importOpen.value = true
}
async function doAdd() {
  const url  = importUrl.value.trim()
  const name = importName.value.trim()
  if (!url && !name) { toast.add({ title: 'URL ou nom requis', color: 'warning' }); return }
  importing.value = true
  try {
    if (url) {
      // Avec URL → import (ex: playlist YouTube)
      const res = await importDbPlaylist({ source: importSource.value, url, name: name || undefined })
      toast.add({ title: 'Playlist importée', description: `${res.name} · ${res.count} titres`, color: 'success', icon: 'i-lucide-download' })
    } else {
      // Sans URL → nouvelle playlist vide
      const pl = await createDbPlaylist(name, importSource.value)
      toast.add({ title: 'Playlist créée', description: pl.name, color: 'success', icon: 'i-lucide-plus' })
      emit('select-playlist', pl as any)
    }
    importOpen.value = false
    await loadHome()
  } catch (e: any) {
    toast.add({ title: 'Opération impossible', description: apiError(e), color: 'error' })
  } finally { importing.value = false }
}

onMounted(async () => {
  // Charge les providers ACTIFS & PUBLICS pour les chips
  try {
    providers.value = (await getProviders()).filter(p => p.active === true || p.public === true)
    initIfEmpty(providers.value.map(p => p.id))   // 1ʳᵉ visite : tout actif ; sinon restaure le choix persisté
  } catch { /* chips indisponibles */ }
  // Puis charge les données pour les sources sélectionnées
  await loadHome()
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
          <UIcon :name="sourceIcon(p.id)" class="size-3.5" />
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
                <p class="text-sm font-medium truncate" :class="{ 'text-primary': isNowPlaying(t, props.currentKey) }">
                  <UIcon v-if="isNowPlaying(t, props.currentKey)" name="i-lucide-audio-lines" class="inline size-3.5 mr-1 animate-pulse" />{{ t.title }}
                </p>
                <p class="text-xs text-dimmed truncate">{{ t.artists?.join(', ') }}</p>
              </div>
              <UButton icon="i-lucide-play" size="xs" color="primary" variant="solid" square class="shrink-0" @click="emit('play-track', t)" />
              <UButton v-if="isYoutube(t)" icon="i-lucide-download" size="xs" color="neutral" variant="soft" square class="shrink-0" title="Télécharger" @click="emit('download-track', t)" />
              <UButton :icon="t.like ? 'mdi:heart' : 'mdi:heart-outline'" size="xs" :color="t.like ? 'primary' : 'neutral'" variant="soft" square class="shrink-0" :title="t.like ? 'Retirer des aimés' : 'Aimer'" @click="emit('save-track', t)" />
              <UButton icon="i-lucide-list-plus" size="xs" color="neutral" variant="soft" square class="shrink-0" title="Ajouter à la file" @click="emit('enqueue-track', t)" />
              <UButton icon="i-lucide-folder-plus" size="xs" color="neutral" variant="soft" square class="shrink-0" title="Ajouter à une playlist" @click="emit('add-to-playlist', t)" />
            </div>
          </div>

          <!-- Charger plus de résultats -->
          <div v-if="searchHasMore" class="flex justify-center pt-3">
            <UButton size="sm" variant="soft" color="neutral" :loading="searchMore" @click="loadMoreSearch">
              {{ searchMore ? 'Chargement…' : 'Charger plus' }}
            </UButton>
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

          <!-- Charger plus d'albums -->
          <div v-if="secHasMore.albums" class="flex justify-center pt-3">
            <UButton size="sm" variant="soft" color="neutral" :loading="secLoading.albums" @click="loadMoreSection('albums')">
              {{ secLoading.albums ? 'Chargement…' : 'Charger plus' }}
            </UButton>
          </div>
        </section>

        <!-- Artistes -->
        <section v-if="filteredResults.artists?.length">
          <h2 class="text-lg font-bold mb-3">Artistes</h2>
          <HScroll>
            <div v-for="ar in filteredResults.artists" :key="ar.id" class="group shrink-0 w-28 sm:w-36 cursor-pointer text-center" @click="emit('select-artist', ar)">
              <div class="relative h-28 w-28 sm:h-36 sm:w-36 rounded-full overflow-hidden mb-2 mx-auto bg-elevated">
                <img v-if="cover(ar)" :src="cover(ar)" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-user-round" class="size-7 text-dimmed" /></div>
                <UButton icon="i-lucide-user-plus" size="sm" color="neutral" square class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" title="Suivre" @click.stop="emit('follow-artist', ar)" />
                <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(ar, 'artist')" />
              </div>
              <p class="text-xs font-semibold truncate">{{ ar.name }}</p>
            </div>
          </HScroll>

          <!-- Charger plus d'artistes -->
          <div v-if="secHasMore.artists" class="flex justify-center pt-3">
            <UButton size="sm" variant="soft" color="neutral" :loading="secLoading.artists" @click="loadMoreSection('artists')">
              {{ secLoading.artists ? 'Chargement…' : 'Charger plus' }}
            </UButton>
          </div>
        </section>

        <!-- Playlists -->
        <section v-if="filteredResults.playlists?.length">
          <h2 class="text-lg font-bold mb-3">Playlists</h2>
          <HScroll>
            <!-- Importer une playlist (URL) -->
            <button class="group shrink-0 w-28 sm:w-36 cursor-pointer text-left" @click="openImport">
              <div class="relative rounded-md overflow-hidden mb-2 h-28 w-28 sm:h-36 sm:w-36 border-2 border-dashed border-default flex flex-col items-center justify-center gap-1 text-dimmed group-hover:text-primary group-hover:border-primary/60 transition-colors">
                <UIcon name="i-lucide-download" class="size-8" />
                <span class="text-[11px] font-medium">Importer</span>
              </div>
              <p class="text-xs font-semibold truncate">Importer</p>
            </button>
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

          <!-- Charger plus de playlists -->
          <div v-if="secHasMore.playlists" class="flex justify-center pt-3">
            <UButton size="sm" variant="soft" color="neutral" :loading="secLoading.playlists" @click="loadMoreSection('playlists')">
              {{ secLoading.playlists ? 'Chargement…' : 'Charger plus' }}
            </UButton>
          </div>
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
        <!-- Playlists, Albums, Artistes : meme rangee de cartes, decrite par homeSections -->
        <template v-for="s in homeSections" :key="s.key">
          <section v-if="s.items.length" class="mb-3">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-xl font-bold">{{ s.title }}</h2>
              <UButton
                v-if="s.items.length > 6"
                size="xs" variant="link" color="primary"
                :trailing-icon="expanded[s.key] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                @click="expanded[s.key] = !expanded[s.key]"
              >{{ expanded[s.key] ? 'Voir moins' : 'Voir plus' }}</UButton>
            </div>
            <component :is="expanded[s.key] ? 'div' : HScroll" :class="expanded[s.key] ? ['flex flex-wrap gap-3', s.round && 'justify-items-center'] : ''">
              <div v-for="x in s.items" :key="x.source + resolveId(x)" class="group shrink-0 w-28 cursor-pointer" :class="s.round && 'text-center'" @click="s.select(x)">
                <div class="relative h-28 w-28 overflow-hidden mb-2 bg-elevated" :class="s.round ? 'rounded-full mx-auto' : 'rounded-md'">
                  <img v-if="cover(x)" :src="cover(x)" class="h-full w-full object-cover" alt="" loading="lazy" />
                  <div v-else class="h-full w-full flex items-center justify-center"><UIcon :name="s.icon" class="size-8 text-dimmed" /></div>
                  <UButton icon="i-lucide-play" size="sm" color="primary" square class="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" @click.stop="playCtx(x, s.type)" />
                </div>
                <p class="text-sm font-semibold truncate">{{ x.name }}</p>
              </div>
            </component>

            <div v-if="homeHasMore[s.key]" class="flex justify-center pt-2">
              <UButton size="xs" variant="soft" color="neutral" :loading="homeLoading[s.key]" @click="loadMoreHome(s.key)">
                {{ homeLoading[s.key] ? 'Chargement…' : 'Charger plus' }}
              </UButton>
            </div>
          </section>
        </template>

        <!-- Dossiers (categories) + Tous les titres -->
        <section v-if="folders.length || activeSources.includes('fileplayer')" class="mb-3">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xl font-bold">Dossiers</h2>
            <UButton
              v-if="folders.length > 6"
              size="xs" variant="link" color="primary"
              :trailing-icon="expanded.folders ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              @click="expanded.folders = !expanded.folders"
            >{{ expanded.folders ? 'Voir moins' : 'Voir plus' }}</UButton>
          </div>
          <component :is="expanded.folders ? 'div' : HScroll" :class="expanded.folders ? 'flex flex-wrap gap-3' : ''">
            <!-- Entrée « Tous les titres » -->
            <div class="group shrink-0 w-28 cursor-pointer" @click="emit('open-trackliste')">
              <div class="relative h-28 w-28 rounded-md overflow-hidden mb-2 bg-primary/15 flex items-center justify-center">
                <UIcon name="i-lucide-music-4" class="size-8 text-primary" />
              </div>
              <p class="text-sm font-semibold truncate">Tous les titres</p>
            </div>
            <!-- Dossiers -->
            <div v-for="f in folders" :key="(f.source ?? '') + f.id" class="group shrink-0 w-28 cursor-pointer" @click="emit('select-category', f)">
              <div class="relative h-28 w-28 rounded-md overflow-hidden mb-2 bg-elevated">
                <img v-if="cover(f)" :src="cover(f)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-folder" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-sm font-semibold truncate">{{ f.name }}</p>
            </div>
          </component>
        </section>

        <!-- Catégorie (genres) -->
        <section v-if="genreChips.length" class="mb-3">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xl font-bold">Catégorie</h2>
            <UButton
              v-if="genreChips.length > 6"
              size="xs" variant="link" color="primary"
              :trailing-icon="expanded.categories ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              @click="expanded.categories = !expanded.categories"
            >{{ expanded.categories ? 'Voir moins' : 'Voir plus' }}</UButton>
          </div>
          <component :is="expanded.categories ? 'div' : HScroll" :class="expanded.categories ? 'flex flex-wrap gap-3' : ''">
            <!-- Entrée « Tous » -->
            <div class="group shrink-0 w-28 cursor-pointer" @click="emit('open-trackliste')">
              <div class="relative h-28 w-28 rounded-md overflow-hidden mb-2 bg-primary/15 flex items-center justify-center">
                <UIcon name="i-lucide-music-4" class="size-8 text-primary" />
              </div>
              <p class="text-sm font-semibold truncate">Tous</p>
            </div>
            <!-- Genres -->
            <div v-for="g in genreChips" :key="g.id" class="group shrink-0 w-28 cursor-pointer" @click="emit('select-genre', g)">
              <div class="relative h-28 w-28 rounded-md overflow-hidden mb-2 bg-elevated">
                <img v-if="cover(g)" :src="cover(g)" class="h-full w-full object-cover" alt="" loading="lazy" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-tag" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-sm font-semibold truncate">{{ g.name }}</p>
            </div>
          </component>
        </section>

        <div v-if="!filteredPlaylists.length && !filteredAlbums.length && !filteredArtists.length && !folders.length && !genreChips.length && !activeSources.includes('fileplayer')" class="text-center py-16 text-dimmed">
          <UIcon name="i-lucide-music" class="size-12 mx-auto mb-3 opacity-40" />
          <p>Bibliothèque vide — lancez une réindexation.</p>
        </div>
      </template>
    </div>

    <!-- Ajouter une playlist : URL → import (YouTube…) / sans URL → playlist vide -->
    <UModal v-model:open="importOpen" title="Ajouter une playlist">
      <template #content>
        <div class="p-6 space-y-4">
          <UFormField label="Source">
            <USelect v-model="importSource" :items="importSourceItems" class="w-full" />
          </UFormField>
          <UFormField label="URL de la playlist" description="Optionnel — pour importer (ex : YouTube).">
            <UInput v-model="importUrl" placeholder="https://www.youtube.com/playlist?list=…" class="w-full" />
          </UFormField>
          <UFormField label="Nom" :description="importUrl.trim() ? 'Optionnel — sinon le nom d\'origine.' : 'Requis (playlist vide, sans URL).'">
            <UInput v-model="importName" placeholder="Ma playlist" class="w-full" />
          </UFormField>
          <div class="flex items-center justify-end gap-2 border-t border-default pt-3">
            <UButton label="Annuler" color="neutral" variant="soft" @click="importOpen = false" />
            <UButton
              :label="importUrl.trim() ? 'Importer' : 'Créer'"
              :icon="importUrl.trim() ? 'i-lucide-download' : 'i-lucide-plus'"
              color="primary" :loading="importing"
              :disabled="!importUrl.trim() && !importName.trim()"
              @click="doAdd"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.scroll-thin { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
.scroll-thin::-webkit-scrollbar { height: 4px; }
.scroll-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
</style>
