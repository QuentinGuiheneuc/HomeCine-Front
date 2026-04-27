<script setup lang="ts">
import http from '@/src/lib/https'

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
}>(), {
  item: null,
  playerHeight: 104
})

const emit = defineEmits<{
  (e: 'select-album', id: string): void
  (e: 'play-track', uri: string): void
}>()

/* ---------- Computed ---------- */
const avatar = computed(() =>
  props.item?.images?.[0]?.url || 'https://via.placeholder.com/200x200?text=Artiste'
)

const formattedFollowers = computed(() => {
  const n = props.item?.followers?.total
  if (!n) return null
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M abonnés'
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' K abonnés'
  return n + ' abonnés'
})

const ms = (v: number) => {
  const s = Math.floor(v / 1000)
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

const albumYear = (a: Album) => a.release_date?.split('-')[0] ?? ''

/* ---------- Lecture ---------- */
async function playTrack(uri: string) {
  try {
    await http.put('/spotify/devices/play', { uris: [uri] })
  } catch (e) {
    console.error('[ItemArtist] play track', e)
  }
}

async function playArtist() {
  if (!props.item?.uri) return
  try {
    await http.put('/spotify/devices/play', { context_uri: props.item.uri })
  } catch (e) {
    console.error('[ItemArtist] play artist', e)
  }
}
</script>

<template>
  <!-- Garde contre un item null (ne devrait pas arriver, mais par sécurité) -->
  <div v-if="!item" class="flex items-center justify-center h-full text-dimmed text-sm">
    Chargement des données artiste…
  </div>

  <div v-else class="flex flex-col h-full min-h-0">

    <!-- Hero artiste -->
    <div class="relative shrink-0 mb-4">
      <div
        class="absolute inset-0 bg-cover bg-center blur-2xl opacity-25 rounded-xl"
        :style="{ backgroundImage: `url(${avatar})` }"
      />
      <div class="relative flex items-end gap-5 px-1 pt-2 pb-3">
        <img
          :src="avatar"
          class="h-36 w-36 rounded-full object-cover shadow-xl shrink-0 ring-2 ring-white/10"
          alt=""
        />
        <div class="min-w-0 pb-1">
          <p class="text-xs uppercase tracking-widest text-dimmed mb-1">Artiste</p>
          <h1 class="text-3xl font-bold leading-tight truncate">{{ item.name }}</h1>
          <p v-if="formattedFollowers" class="mt-1 text-sm text-dimmed">{{ formattedFollowers }}</p>
          <p v-if="item.genres?.length" class="mt-0.5 text-xs text-dimmed truncate">
            {{ item.genres.slice(0, 3).join(' · ') }}
          </p>
          <div class="mt-3 flex items-center gap-2">
            <UButton icon="i-lucide-play" size="sm" @click="playArtist">Lire</UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 min-h-0 overflow-y-auto" :style="{ paddingBottom: playerHeight + 'px' }">

      <!-- Top titres -->
      <section class="mb-6">
        <h2 class="text-base font-semibold px-2 mb-2">Top titres</h2>

        <p v-if="!item.topTracks?.length" class="px-2 py-1 text-sm text-dimmed">
          Aucun titre populaire disponible.
        </p>

        <div
          v-for="(t, idx) in (item.topTracks ?? []).slice(0, 10)"
          :key="t.id"
          class="group grid grid-cols-[2rem_2.5rem_1fr_4rem] gap-x-3 items-center px-2 py-1.5 hover:bg-elevated/40 rounded cursor-default"
          @dblclick="playTrack(t.uri)"
        >
          <div class="flex items-center justify-center">
            <span class="text-xs tabular-nums text-dimmed group-hover:hidden">{{ idx + 1 }}</span>
            <UButton
              icon="i-lucide-play"
              variant="ghost"
              color="neutral"
              size="xs"
              class="hidden group-hover:flex"
              @click.stop="playTrack(t.uri)"
            />
          </div>

          <img
            :src="t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || 'https://via.placeholder.com/40x40?text=♪'"
            class="h-9 w-9 rounded object-cover"
            :alt="t.name"
          />

          <div class="min-w-0">
            <p class="truncate text-sm font-medium leading-tight">{{ t.name }}</p>
            <p class="truncate text-xs text-dimmed">{{ t.album?.name ?? '' }}</p>
          </div>

          <span class="text-xs tabular-nums text-dimmed text-right">{{ ms(t.duration_ms) }}</span>
        </div>
      </section>

      <!-- Discographie -->
      <section class="mb-4">
        <h2 class="text-base font-semibold px-2 mb-3">Discographie</h2>

        <p v-if="!item.albums?.length" class="px-2 py-1 text-sm text-dimmed">
          Aucun album disponible.
        </p>

        <div v-else class="overflow-x-auto pb-2 scrollbar-none">
          <div class="flex gap-4 px-2">
            <div
              v-for="al in item.albums"
              :key="al.id"
              class="group shrink-0 w-40 cursor-pointer"
              @click="$emit('select-album', al.id)"
            >
              <div class="relative rounded-md overflow-hidden mb-2">
                <img
                  :src="al.images?.[0]?.url ?? 'https://via.placeholder.com/160x160?text=Album'"
                  class="h-40 w-40 object-cover"
                  alt=""
                  loading="lazy"
                />
                <button
                  class="absolute bottom-2 right-2 h-9 w-9 rounded-full bg-[#1DB954] flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
                  @click.stop="al.uri ? http.put('/spotify/devices/play', { context_uri: al.uri }).catch(() => {}) : null"
                >
                  <UIcon name="i-lucide-play" class="text-black size-4 ml-0.5" />
                </button>
              </div>
              <p class="text-sm font-semibold truncate">{{ al.name }}</p>
              <p class="text-xs text-dimmed truncate mt-0.5">
                {{ albumYear(al) }}
                <span v-if="al.album_type === 'single'"> · Single</span>
                <span v-else-if="al.album_type === 'compilation'"> · Compilation</span>
              </p>
            </div>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
