<script setup lang="ts">
import http from '@/src/lib/https'

/* ---------- Types ---------- */
type Image  = { url: string; width?: number | null; height?: number | null }
type Artist = { id: string; name: string }
type AlbumTrack = {
  id: string
  name: string
  duration_ms: number
  uri: string
  track_number: number
  artists?: Artist[]
  disc_number?: number
}
type AlbumDetail = {
  id: string
  name: string
  album_type?: string
  release_date?: string
  total_tracks?: number
  images?: Image[]
  uri?: string
  label?: string
  artists?: Artist[]
  tracks?: {
    items: AlbumTrack[]
    total: number
    limit: number
    offset: number
    next?: string | null
  }
}

/* ---------- Props / Emits ---------- */
const props = withDefaults(defineProps<{
  item: AlbumDetail
  playerHeight?: number
  hasMore?: boolean
  loadingMore?: boolean
}>(), {
  playerHeight: 104,
  hasMore: false,
  loadingMore: false
})

const emit = defineEmits<{
  (e: 'load-more'): void
  (e: 'play-track', uri: string): void
  (e: 'select-artist', id: string): void
}>()

/* ---------- Computed ---------- */
const cover = computed(() =>
  props.item?.images?.[0]?.url || 'https://via.placeholder.com/180x180?text=Album'
)

const year = computed(() => {
  const d = props.item?.release_date
  return d ? d.split('-')[0] : null
})

const rows = computed<AlbumTrack[]>(() =>
  props.item?.tracks?.items ?? []
)

const ms = (v: number) => {
  const s = Math.floor(v / 1000)
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

const albumTypeLabel = computed(() => {
  switch (props.item?.album_type) {
    case 'single':      return 'Single'
    case 'compilation': return 'Compilation'
    default:            return 'Album'
  }
})

/* ---------- Lecture ---------- */
async function playAlbumFrom(offset = 0) {
  try {
    await http.put('/spotify/devices/play', {
      context_uri: props.item?.uri,
      offset: { position: offset }
    })
  } catch (e) {
    console.error('[ItemAlbum] play error', e)
  }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div class="pb-3 shrink-0">
      <div class="flex items-end gap-5">
        <img :src="cover" class="h-36 w-36 rounded-md object-cover shadow-lg shrink-0" alt="" />
        <div class="min-w-0 pb-1">
          <p class="text-xs uppercase tracking-widest text-dimmed mb-1">{{ albumTypeLabel }}</p>
          <h1 class="text-2xl font-bold leading-tight truncate">{{ item?.name }}</h1>
          <p class="mt-1 text-sm text-dimmed">
            <template v-for="(a, i) in (item?.artists ?? [])" :key="a.id">
              <button
                class="hover:underline hover:text-highlighted"
                @click="$emit('select-artist', a.id)"
              >{{ a.name }}</button>
              <span v-if="i < (item?.artists?.length ?? 0) - 1">, </span>
            </template>
            <span v-if="year"> · {{ year }}</span>
            <span v-if="item?.total_tracks"> · {{ item.total_tracks }} titre{{ item.total_tracks !== 1 ? 's' : '' }}</span>
          </p>
          <div class="mt-3 flex items-center gap-2">
            <UButton icon="i-lucide-play" size="sm" @click="playAlbumFrom(0)">Lire</UButton>
            <UButton icon="i-lucide-shuffle" size="sm" variant="ghost" color="neutral" @click="playAlbumFrom(0)" />
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable -->
    <div class="flex-1 min-h-0 overflow-y-auto" :style="{ paddingBottom: playerHeight + 'px' }">

      <div class="grid grid-cols-[2rem_1fr_4rem] gap-x-3 px-2 py-1.5 text-[11px] uppercase tracking-wider text-dimmed border-b border-default sticky top-0 bg-background/80 backdrop-blur z-10">
        <span class="text-center">#</span>
        <span>Titre</span>
        <span class="text-right">Durée</span>
      </div>

      <div v-if="rows.length === 0" class="p-4 text-sm text-dimmed">
        Aucune piste disponible.
      </div>

      <div
        v-for="t in rows"
        :key="t.id"
        class="group grid grid-cols-[2rem_1fr_4rem] gap-x-3 items-center px-2 py-1.5 hover:bg-elevated/40 rounded cursor-default"
        @dblclick="$emit('play-track', t.uri)"
      >
        <div class="flex items-center justify-center">
          <span class="text-xs tabular-nums text-dimmed group-hover:hidden">{{ t.track_number }}</span>
          <UButton
            icon="i-lucide-play"
            variant="ghost"
            color="neutral"
            size="xs"
            class="hidden group-hover:flex"
            @click.stop="$emit('play-track', t.uri)"
          />
        </div>

        <div class="min-w-0">
          <p class="truncate text-sm font-medium leading-tight">{{ t.name }}</p>
          <p class="truncate text-xs text-dimmed">
            <template v-for="(a, i) in (t.artists ?? [])" :key="a.id">
              <button
                class="hover:underline hover:text-highlighted"
                @click.stop="$emit('select-artist', a.id)"
              >{{ a.name }}</button>
              <span v-if="i < (t.artists?.length ?? 0) - 1">, </span>
            </template>
          </p>
        </div>

        <span class="text-xs tabular-nums text-dimmed text-right">{{ ms(t.duration_ms) }}</span>
      </div>

      <div v-if="hasMore" class="p-3">
        <UButton :loading="loadingMore" variant="soft" icon="i-lucide-chevrons-down" @click="$emit('load-more')">
          Charger plus
        </UButton>
      </div>
    </div>
  </div>
</template>
