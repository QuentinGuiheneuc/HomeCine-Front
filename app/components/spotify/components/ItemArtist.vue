<script setup lang="ts">
import { ref, computed } from 'vue'

/* ---------- Types ---------- */
type Image  = { url: string; width?: number | null; height?: number | null }
type Artist = { id: string; name: string }
type Track  = {
  id: string; name: string; duration_ms: number; uri: string
  album?: { id: string; name: string; images?: Image[] }
  artists?: Artist[]
}
type Album = {
  id: string; name: string; album_type: string
  release_date?: string; total_tracks?: number
  images?: Image[]; uri?: string; artists?: Artist[]
}
type ArtistDetail = {
  id: string
  name: string
  genres?: string[]
  images?: Image[]
  uri?: string
  followers?: { total: number }
  popularity?: number
  topTracks?: Track[]
  albums?: Album[]
}

/* ---------- Props / Emits ---------- */
const props = withDefaults(defineProps<{
  item: ArtistDetail | null
  playerHeight?: number
  hasMoreTracks?: boolean
  loadingMoreTracks?: boolean
  likedTracks?: Track[]          // titres aimés de l'artiste (source paginée dédiée)
  hasMoreLiked?: boolean
  loadingMoreLiked?: boolean
  hasMoreAlbums?: boolean        // discographie paginée
  loadingMoreAlbums?: boolean
  currentKey?: string            // clé (sourceId/uri/titre) de la piste en cours de lecture
}>(), {
  item: null,
  playerHeight: 104
})

const emit = defineEmits<{
  (e: 'select-album', id: string): void
  (e: 'play-track', uri: string): void
  (e: 'play-all'): void
  (e: 'play-liked'): void
  (e: 'follow'): void
  (e: 'save-track', track: any): void
  (e: 'enqueue-track', track: any): void
  (e: 'add-to-playlist', track: any): void
  (e: 'download-track', track: any): void
  (e: 'load-more-tracks'): void
  (e: 'load-more-liked'): void
  (e: 'load-more-albums'): void
}>()

/** Piste originale (LibraryTrack) conservée dans __src par le mapper */
const src = (t: any) => t?.__src ?? t

/** La piste t est-elle celle en cours de lecture ? (helper partagé) */
const isPlaying = (t: any) => isNowPlaying(t, props.currentKey)

/* ---------- Onglet Top titres / Aimés (les aimés sont préchargés par le parent) ---------- */
const tab = ref<'top' | 'liked'>('top')
const allTracks   = computed(() => props.item?.topTracks ?? [])
const likedList   = computed(() => props.likedTracks ?? [])
const shownTracks = computed(() => tab.value === 'liked' ? likedList.value : allTracks.value)
const hasMoreCurrent = computed(() => tab.value === 'liked' ? !!props.hasMoreLiked : !!props.hasMoreTracks)
const loadingCurrent = computed(() => tab.value === 'liked' ? !!props.loadingMoreLiked : !!props.loadingMoreTracks)

function setTab(t: 'top' | 'liked') { tab.value = t }
function loadMoreCurrent() {
  if (tab.value === 'liked') emit('load-more-liked')
  else emit('load-more-tracks')
}

/* ---------- Scroll infini ---------- */
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting && hasMoreCurrent.value && !loadingCurrent.value) loadMoreCurrent()
})

/* ---------- Hero / infos ---------- */
const avatar = computed(() =>
  props.item?.images?.[0]?.url || 'https://via.placeholder.com/200x200?text=Artiste'
)
const genres = computed(() => (props.item?.genres ?? []).slice(0, 4))

const formattedFollowers = computed(() => {
  const n = props.item?.followers?.total
  if (!n) return null
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' M abonnés'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' K abonnés'
  return n + ' abonnés'
})
/** « 24 titres » (+ si d'autres pages sont disponibles) */
const tracksCountLabel = computed(() => {
  const n = allTracks.value.length
  if (!n) return null
  return `${n}${props.hasMoreTracks ? '+' : ''} titre${n > 1 ? 's' : ''}`
})

const ms = (v: number) => {
  const s = Math.floor(v / 1000)
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

/* ---------- Discographie groupée ---------- */
const albumYear = (a: Album) => a.release_date?.split('-')[0] ?? ''
const discoGroups = computed(() => {
  const all = props.item?.albums ?? []
  const groups = [
    { key: 'album',       label: 'Albums',        items: all.filter(a => (a.album_type ?? 'album') === 'album') },
    { key: 'single',      label: 'Singles & EP',  items: all.filter(a => a.album_type === 'single') },
    { key: 'compilation', label: 'Compilations',  items: all.filter(a => a.album_type === 'compilation') },
  ]
  return groups.filter(g => g.items.length)
})

/** Sections de discographie dépliées (grille complète au lieu du carrousel) */
const discoExpanded = ref<Record<string, boolean>>({})
const toggleDisco = (key: string) => { discoExpanded.value[key] = !discoExpanded.value[key] }

/* ---------- Lecture ---------- */
function playTrack(uri: string) { emit('play-track', uri) }
function playArtist() {
  // Onglet Aimés → lit les titres aimés ; sinon le contexte artiste (/library/play type:artist)
  if (tab.value === 'liked') emit('play-liked')
  else emit('play-all')
}
</script>

<template>
  <!-- Garde contre un item null -->
  <div v-if="!item" class="flex items-center justify-center h-full text-dimmed text-sm">
    Chargement des données artiste…
  </div>

  <div v-else class="flex flex-col h-full min-h-0">

    <!-- ── Hero artiste ───────────────────────────────────────────────────── -->
    <div class="relative shrink-0 mb-5 rounded-xl overflow-hidden">
      <div
        class="absolute inset-0 bg-cover bg-center blur-2xl opacity-30 scale-110"
        :style="{ backgroundImage: `url(${avatar})` }"
      />
      <div class="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div class="relative flex items-end gap-5 px-3 pt-6 pb-4">
        <img
          :src="avatar"
          class="h-28 w-28 sm:h-40 sm:w-40 rounded-full object-cover shadow-2xl shrink-0 ring-2 ring-white/10"
          alt=""
        />
        <div class="min-w-0 pb-1">
          <p class="text-[11px] uppercase tracking-widest text-dimmed mb-1 flex items-center gap-1">
            <UIcon name="i-lucide-badge-check" class="size-3.5 text-primary" /> Artiste
          </p>
          <h1 class="text-2xl sm:text-4xl font-bold leading-tight truncate">{{ item.name }}</h1>

          <!-- Méta : abonnés · titres -->
          <div class="mt-1.5 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-sm text-dimmed">
            <span v-if="formattedFollowers" class="inline-flex items-center gap-1">
              <UIcon name="i-lucide-users" class="size-3.5" />{{ formattedFollowers }}
            </span>
            <span v-if="formattedFollowers && tracksCountLabel" class="opacity-40">·</span>
            <span v-if="tracksCountLabel" class="inline-flex items-center gap-1">
              <UIcon name="i-lucide-music" class="size-3.5" />{{ tracksCountLabel }}
            </span>
          </div>

          <!-- Genres -->
          <div v-if="genres.length" class="mt-2 flex items-center gap-1.5 flex-wrap">
            <UBadge v-for="g in genres" :key="g" color="neutral" variant="subtle" size="sm" class="capitalize">{{ g }}</UBadge>
          </div>

          <!-- Actions -->
          <div class="mt-3 flex items-center gap-2">
            <UButton icon="i-lucide-play" size="md" @click="playArtist">Lire</UButton>
            <UButton icon="i-lucide-user-plus" size="md" variant="soft" color="neutral" @click="emit('follow')">Suivre</UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Contenu scrollable ─────────────────────────────────────────────── -->
    <div class="flex-1 min-h-0 overflow-y-auto" :style="{ paddingBottom: playerHeight + 'px' }">

      <!-- Titres : onglet Top / Aimés -->
      <section class="mb-7">
        <div class="flex items-center gap-1.5 px-2 mb-2">
          <button
            class="text-base font-semibold px-1 pb-0.5 border-b-2 transition-colors"
            :class="tab === 'top' ? 'text-highlighted border-primary' : 'text-dimmed border-transparent hover:text-default'"
            @click="setTab('top')"
          >Top titres</button>
          <button
            class="inline-flex items-center gap-1 text-base font-semibold px-1 pb-0.5 border-b-2 transition-colors"
            :class="tab === 'liked' ? 'text-primary border-primary' : 'text-dimmed border-transparent hover:text-default'"
            @click="setTab('liked')"
          >
            <UIcon name="mdi:heart" class="size-4" />Aimés
            <span v-if="likedList.length" class="text-xs font-normal opacity-70">{{ likedList.length }}</span>
          </button>
        </div>

        <!-- En-tête de colonnes (sm+) -->
        <div
          v-if="shownTracks.length"
          class="hidden sm:grid grid-cols-[2rem_2.75rem_1fr_minmax(6rem,14rem)_auto] gap-x-3 items-center px-2 pb-1.5 mb-1 border-b border-default text-[11px] uppercase tracking-wider text-dimmed"
        >
          <span class="text-center">#</span>
          <span></span>
          <span>Titre</span>
          <span class="truncate">Album</span>
          <span class="text-right pr-1"><UIcon name="i-lucide-clock" class="size-3.5" /></span>
        </div>

        <!-- États vides -->
        <p v-if="tab === 'liked' && loadingCurrent && !likedList.length" class="px-2 py-3 text-sm text-dimmed">
          <UIcon name="i-lucide-loader-circle" class="inline size-4 animate-spin mr-1" />Chargement…
        </p>
        <p v-else-if="tab === 'liked' && !likedList.length" class="px-2 py-3 text-sm text-dimmed">
          <UIcon name="mdi:heart-off" class="inline size-4 mr-1 opacity-50" />Aucun titre aimé de cet artiste.
        </p>
        <p v-else-if="!shownTracks.length" class="px-2 py-3 text-sm text-dimmed">
          Aucun titre populaire disponible.
        </p>

        <!-- Lignes -->
        <div
          v-for="(t, idx) in shownTracks"
          :key="t.id"
          class="group grid grid-cols-[2rem_2.75rem_1fr_auto] sm:grid-cols-[2rem_2.75rem_1fr_minmax(6rem,14rem)_auto] gap-x-3 items-center px-2 py-1.5 rounded-md hover:bg-elevated/50 cursor-default transition-colors"
          @dblclick="playTrack(t.uri)"
        >
          <!-- Numéro / play / indicateur de lecture -->
          <div class="flex items-center justify-center">
            <UIcon v-if="isPlaying(t)" name="i-lucide-audio-lines" class="size-4 text-primary animate-pulse group-hover:hidden" />
            <span v-else class="text-sm tabular-nums text-dimmed group-hover:hidden">{{ idx + 1 }}</span>
            <UButton icon="i-lucide-play" variant="ghost" color="neutral" size="xs" class="hidden group-hover:flex" @click.stop="playTrack(t.uri)" />
          </div>

          <!-- Pochette -->
          <img
            :src="t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || 'https://via.placeholder.com/40x40?text=♪'"
            class="h-10 w-10 rounded object-cover"
            :alt="t.name"
            loading="lazy"
          />

          <!-- Titre + artistes -->
          <div class="min-w-0">
            <p class="truncate text-sm font-medium leading-tight" :class="isPlaying(t) ? 'text-primary' : ''">{{ t.name }}</p>
            <p class="truncate text-xs text-dimmed">{{ (t.artists ?? []).map(a => a.name).join(', ') || (item?.name ?? '') }}</p>
          </div>

          <!-- Album (sm+) -->
          <p class="hidden sm:block truncate text-sm text-dimmed">{{ t.album?.name ?? '' }}</p>

          <!-- Actions + durée -->
          <div class="flex items-center gap-0.5 justify-end">
            <UButton
              :icon="src(t).like ? 'mdi:heart' : 'mdi:heart-outline'"
              size="xs" variant="ghost"
              :color="src(t).like ? 'primary' : 'neutral'"
              :class="src(t).like ? '' : 'opacity-0 group-hover:opacity-100'"
              :title="src(t).like ? 'Retirer des aimés' : 'Aimer'"
              @click.stop="emit('save-track', src(t))"
            />
            <UButton v-if="isYoutube(src(t))" icon="i-lucide-download" size="xs" variant="ghost" color="neutral" title="Télécharger" class="opacity-0 group-hover:opacity-100" @click.stop="emit('download-track', src(t))" />
            <UButton icon="i-lucide-list-plus"   size="xs" variant="ghost" color="neutral" title="Ajouter à la file"      class="opacity-0 group-hover:opacity-100 hidden sm:inline-flex" @click.stop="emit('enqueue-track', src(t))" />
            <UButton icon="i-lucide-folder-plus" size="xs" variant="ghost" color="neutral" title="Ajouter à une collection" class="opacity-0 group-hover:opacity-100" @click.stop="emit('add-to-playlist', src(t))" />
            <span class="text-xs tabular-nums text-dimmed w-10 text-right">{{ ms(t.duration_ms) }}</span>
          </div>
        </div>

        <!-- Charger plus (+ scroll infini) -->
        <div v-if="hasMoreCurrent" ref="sentinel" class="flex justify-center pt-3">
          <UButton size="sm" variant="soft" color="neutral" @click="loadMoreCurrent">
            {{ loadingCurrent ? 'Chargement…' : 'Charger plus' }}
          </UButton>
        </div>
      </section>

      <!-- Discographie groupée -->
      <!-- w-full + min-w-0 : la section ne peut pas élargir son parent (sinon la grille
           dépliée s'étale sans limite) ; max-w : largeur de contenu confortable -->
      <section v-if="discoGroups.length" class="mb-4 space-y-6 w-full min-w-0 max-w-[1340px]">
        <div v-for="g in discoGroups" :key="g.key" class="min-w-0">
          <div class="flex items-baseline gap-2 px-2 mb-3">
            <h2 class="text-base font-semibold">{{ g.label }}</h2>
            <span class="text-xs text-dimmed">{{ g.items.length }}</span>
            <UButton
              size="xs" variant="link" color="primary" class="ms-auto"
              :trailing-icon="discoExpanded[g.key] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              @click="toggleDisco(g.key)"
            >{{ discoExpanded[g.key] ? 'Voir moins' : 'Voir plus' }}</UButton>
          </div>

          <div :class="discoExpanded[g.key] ? '' : 'overflow-x-auto pb-2 scrollbar-none'">
            <div :class="discoExpanded[g.key] ? 'flex flex-wrap gap-3 sm:gap-4 px-2' : 'flex gap-3 sm:gap-4 px-2'">
              <div
                v-for="al in g.items"
                :key="al.id"
                class="group shrink-0 w-32 sm:w-40 cursor-pointer"
                @click="$emit('select-album', al.id)"
              >
                <div class="relative rounded-md overflow-hidden mb-2 bg-elevated">
                  <img
                    :src="al.images?.[0]?.url ?? 'https://via.placeholder.com/160x160?text=Album'"
                    class="h-32 w-32 sm:h-40 sm:w-40 object-cover"
                    alt=""
                    loading="lazy"
                  />
                  <button
                    class="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-primary text-inverted flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
                    @click.stop="$emit('select-album', al.id)"
                  >
                    <UIcon name="i-lucide-play" class="size-4 ml-0.5" />
                  </button>
                </div>
                <p class="text-sm font-semibold truncate">{{ al.name }}</p>
                <p class="text-xs text-dimmed truncate mt-0.5">
                  {{ albumYear(al) }}
                  <span v-if="al.total_tracks"> · {{ al.total_tracks }} titres</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Charger plus d'albums (pagination serveur) -->
        <div v-if="hasMoreAlbums" class="flex justify-center pt-1">
          <UButton size="sm" variant="soft" color="neutral" :loading="loadingMoreAlbums" @click="emit('load-more-albums')">
            {{ loadingMoreAlbums ? 'Chargement…' : 'Charger plus' }}
          </UButton>
        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
