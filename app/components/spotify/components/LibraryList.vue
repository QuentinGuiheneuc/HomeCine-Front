<script setup lang="ts">
/** ---------- Types minimalistes ---------- */
type Image = { url: string; width?: number | null; height?: number | null }

type LibraryAlbum = {
  id: string
  name: string
  artists: string[]
  images?: Image[]
  total_tracks: number
  release_year?: number
}

type LibraryArtist = {
  id: string
  name: string
  images?: Image[]
  followers?: number
}

type LibraryTrack = {
  id: string
  name: string
  artists: string[]
  images?: Image[]        // pochette d’album
  duration_ms: number
}

/** ---------- FAKE DATA ---------- */
const MOCK_ALBUMS: LibraryAlbum[] = [
  {
    id: 'alb_1',
    name: 'Future Nostalgia',
    artists: ['Dua Lipa'],
    images: [{ url: 'https://i.scdn.co/image/ab67616d0000b2739d8c9f7d0d1b3dffb5b8a9b2' }],
    total_tracks: 13,
    release_year: 2020
  },
  {
    id: 'alb_2',
    name: 'After Hours',
    artists: ['The Weeknd'],
    images: [{ url: 'https://i.scdn.co/image/ab67616d0000b273b9acc9f3ccaa8a0a5f7c0e4f' }],
    total_tracks: 14,
    release_year: 2020
  },
  {
    id: 'alb_3',
    name: 'Random Access Memories',
    artists: ['Daft Punk'],
    images: [{ url: 'https://i.scdn.co/image/ab67616d0000b273b3a1aa4f9e6a7c8c4b8a2f8f' }],
    total_tracks: 13,
    release_year: 2013
  }
]

const MOCK_ARTISTS: LibraryArtist[] = [
  {
    id: 'art_1',
    name: 'Dua Lipa',
    images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb4c0db5e7b2b8a929b7cda6c0' }],
    followers: 30000000
  },
  {
    id: 'art_2',
    name: 'The Weeknd',
    images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb3b6a1d9aa9c3f234e6eafc92' }],
    followers: 60000000
  },
  {
    id: 'art_3',
    name: 'Daft Punk',
    images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb8d8d7c8c6d6b5a4a3a2b1c0d' }],
    followers: 12000000
  }
]

const MOCK_TRACKS: LibraryTrack[] = [
  {
    id: 'trk_1',
    name: 'Levitating',
    artists: ['Dua Lipa'],
    images: [{ url: 'https://i.scdn.co/image/ab67616d0000b2739d8c9f7d0d1b3dffb5b8a9b2' }],
    duration_ms: 203000
  },
  {
    id: 'trk_2',
    name: 'Blinding Lights',
    artists: ['The Weeknd'],
    images: [{ url: 'https://i.scdn.co/image/ab67616d0000b273b9acc9f3ccaa8a0a5f7c0e4f' }],
    duration_ms: 200000
  },
  {
    id: 'trk_3',
    name: 'Get Lucky',
    artists: ['Daft Punk', 'Pharrell Williams'],
    images: [{ url: 'https://i.scdn.co/image/ab67616d0000b273b3a1aa4f9e6a7c8c4b8a2f8f' }],
    duration_ms: 248000
  }
]

/** ---------- Onglets (Albums / Artistes / Titres) ---------- */
type TabKey = 'albums' | 'artists' | 'tracks'
const tabs: { key: TabKey; label: string }[] = [
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artistes' },
  { key: 'tracks', label: 'Titres likés' }
]
const current = ref<TabKey>('albums')

/** ---------- Recherche + Pagination locales ---------- */
const q = ref('')
function normalize(s: string) { return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() }

const page = reactive({ limit: 8, offset: 0 })
const totalForTab = computed(() => {
  switch (current.value) {
    case 'albums': return MOCK_ALBUMS.length
    case 'artists': return MOCK_ARTISTS.length
    case 'tracks': return MOCK_TRACKS.length
  }
})
const currentPage = computed(() => Math.floor(page.offset / page.limit) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(totalForTab.value / page.limit)))

function setTab(t: TabKey) { current.value = t; page.offset = 0 }

function sliceTab<T>(arr: T[]): T[] {
  return arr.slice(page.offset, page.offset + page.limit)
}
function filterByQuery<T extends { name: string }>(arr: T[]): T[] {
  if (!q.value) return arr
  const needle = normalize(q.value)
  return arr.filter(it => normalize(it.name).includes(needle))
}

/** ---------- Données filtrées selon onglet ---------- */
const viewAlbums = computed(() => filterByQuery(sliceTab(MOCK_ALBUMS)))
const viewArtists = computed(() => filterByQuery(sliceTab(MOCK_ARTISTS)))
const viewTracks = computed(() => filterByQuery(sliceTab(MOCK_TRACKS)))

/** ---------- Helpers ---------- */
const ms = (v: number) => {
  const s = Math.floor(v / 1000), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}
const rangeLabel = computed(() => {
  const start = page.offset + 1
  const end = Math.min(page.offset + page.limit, totalForTab.value)
  return `${start}–${end} / ${totalForTab.value}`
})

/** ---------- Actions (fake) ---------- */
function playAlbum(id: string) {
  // eslint-disable-next-line no-console
  console.log('[PLAY ALBUM]', id)
}
function playArtist(id: string) {
  console.log('[PLAY ARTIST]', id)
}
function playTrack(id: string) {
  console.log('[PLAY TRACK]', id)
}

/** ---------- Pagination ---------- */
function prevPage() {
  if (page.offset === 0) return
  page.offset = Math.max(0, page.offset - page.limit)
}
function nextPage() {
  const next = page.offset + page.limit
  if (next >= totalForTab.value) return
  page.offset = next
}
</script>

<template>
  <div>
    <!-- Header: tabs + search + compteur -->
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
      <div class="flex items-center gap-2">
        <UButton
          v-for="t in tabs" :key="t.key"
          :label="t.label"
          :variant="current === t.key ? 'solid' : 'ghost'"
          :color="current === t.key ? 'primary' : 'neutral'"
          size="sm"
          @click="setTab(t.key)"
        />
      </div>

      <div class="flex items-center gap-3">
        <UInput v-model="q" placeholder="Rechercher…" class="max-w-sm" />
        <div class="text-sm text-dimmed" v-if="totalForTab">{{ rangeLabel }}</div>
      </div>
    </div>

    <!-- GRID Albums -->
    <div v-if="current === 'albums'">
      <div v-if="!viewAlbums.length" class="text-sm text-dimmed">Aucun album.</div>
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <UCard v-for="a in viewAlbums" :key="a.id" class="group hover:bg-elevated/40">
          <div class="relative">
            <img
              :src="a.images?.[0]?.url || 'https://via.placeholder.com/320x320?text=Album'"
              class="w-full aspect-square object-cover rounded-md"
              alt=""
            />
            <UButton
              icon="i-lucide-play"
              class="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
              color="primary"
              @click="playAlbum(a.id)"
            />
          </div>
          <div class="mt-3 min-w-0">
            <div class="truncate font-medium">{{ a.name }}</div>
            <p class="text-xs text-dimmed truncate">
              {{ a.artists.join(', ') }} · {{ a.total_tracks }} titres<span v-if="a.release_year"> · {{ a.release_year }}</span>
            </p>
          </div>
        </UCard>
      </div>
    </div>

    <!-- GRID Artistes -->
    <div v-else-if="current === 'artists'">
      <div v-if="!viewArtists.length" class="text-sm text-dimmed">Aucun artiste.</div>
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <UCard v-for="art in viewArtists" :key="art.id" class="group hover:bg-elevated/40">
          <div class="relative">
            <img
              :src="art.images?.[0]?.url || 'https://via.placeholder.com/320x320?text=Artist'"
              class="w-full aspect-square object-cover rounded-full"
              alt=""
            />
            <UButton
              icon="i-lucide-play"
              class="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
              color="primary"
              @click="playArtist(art.id)"
            />
          </div>
          <div class="mt-3 min-w-0">
            <div class="truncate font-medium">{{ art.name }}</div>
            <p class="text-xs text-dimmed truncate">
              {{ (art.followers ?? 0).toLocaleString() }} followers
            </p>
          </div>
        </UCard>
      </div>
    </div>

    <!-- LIST Titres -->
    <div v-else>
      <div v-if="!viewTracks.length" class="text-sm text-dimmed">Aucun titre.</div>
      <div v-else class="rounded-md border border-default divide-y divide-default">
        <div
          v-for="(t, idx) in viewTracks"
          :key="t.id"
          class="group flex items-center gap-3 p-2 hover:bg-elevated/40"
          @dblclick="playTrack(t.id)"
        >
          <span class="w-8 text-center text-xs tabular-nums text-dimmed">{{ page.offset + idx + 1 }}</span>

          <img
            :src="t.images?.[0]?.url || 'https://via.placeholder.com/96x96?text=♪'"
            class="h-12 w-12 rounded object-cover"
            alt=""
          />

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ t.name }}</p>
            <p class="truncate text-xs text-dimmed">{{ t.artists.join(', ') }}</p>
          </div>

          <span class="text-xs text-dimmed w-12 text-right">{{ ms(t.duration_ms) }}</span>

          <div class="ms-2 hidden items-center gap-1 group-hover:flex">
            <UButton icon="i-lucide-play" variant="ghost" size="xs" @click="playTrack(t.id)" />
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="mt-6 flex items-center justify-between" v-if="totalForTab > page.limit">
      <UButton variant="outline" icon="i-lucide-chevron-left"
               :disabled="page.offset === 0"
               @click="prevPage">
        Précédent
      </UButton>
      <div class="text-sm text-dimmed">
        {{ currentPage }} / {{ totalPages }}
      </div>
      <UButton variant="outline" trailing-icon="i-lucide-chevron-right"
               :disabled="page.offset + page.limit >= totalForTab"
               @click="nextPage">
        Suivant
      </UButton>
    </div>
  </div>
</template>
