<script setup lang="ts">
import http from '@/src/lib/https'

/* ---------- Types ---------- */
type Image = { url: string; width?: number | null; height?: number | null }
type Album = { id: string; name: string; images?: Image[] }
type Artist = { id: string; name: string }
type Track = {
  id: string
  name: string
  duration_ms: number
  uri: string
  album?: Album
  artists?: Artist[]
}
type PlaylistTrackItem = { added_at?: string; track: Track | null }
type PlaylistDetail = {
  id: string
  name: string
  description?: string | null
  images?: Image[]
  uri?: string
  tracks: {
    limit: number
    total: number
    offset: number
    items: PlaylistTrackItem[]
  }
}

/* ---------- Props / Emits ---------- */
const props = withDefaults(defineProps<{
  item: PlaylistDetail
  /** Hauteur du player pour éviter le chevauchement */
  playerHeight?: number
  /** Pagination (optionnelle) gérée par le parent */
  hasMore?: boolean
  loadingMore?: boolean
  /** ID Spotify du user courant (ex: "11156740298") */
  userId?: string
}>(), {
  playerHeight: 104,
  hasMore: false,
  loadingMore: false
})

const emit = defineEmits<{
  (e: 'load-more'): void
  (e: 'play-in-context', payload: { contextUri?: string; offset: number }): void
}>()

/* ---------- Computed ---------- */
const isLiked = computed(() => props.item?.id === 'liked')

const rows = computed<Track[]>(() =>
  (props.item?.tracks?.items ?? [])
    .map(i => i.track)
    .filter((t): t is Track => !!t)
)

const cover = computed(() =>
  props.item?.images?.[0]?.url || 'https://via.placeholder.com/180x180?text=Playlist'
)

const ms = (v: number) => {
  const s = Math.floor(v / 1000)
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

/* ---------- Lecture ---------- */
/** Tente le contexte "collection", sinon fallback URIs */
async function playLikedContext(offset = 0) {
  const uid = props.userId
  const uris = rows.value.map(t => t.uri)
  const i = Math.max(0, Math.min(offset, Math.max(0, uris.length - 1)))

  try {
    if (!uid) throw new Error('userId manquant pour le contexte collection')
    await http.put('/spotify/devices/play', {
      context_uri: `spotify:user:${uid}:collection`,
      offset: { position: i }
    })
  } catch (e) {
    // Fallback robuste : on aligne la file d’attente sur l’index
    const ordered = uris.length ? [...uris.slice(i), ...uris.slice(0, i)] : []
    if (ordered.length) {
      await http.put('/spotify/devices/play', { uris: ordered })
    }
  }
}

function onHeaderPlay() {
  if (isLiked.value) {
    // Titres likés -> collection
    return playLikedContext(0)
  }
  // Playlist classique -> on laisse le parent gérer (context_uri + offset=0)
  emit('play-in-context', { contextUri: props.item?.uri, offset: 0 })
}

function onRowPlay(idx: number) {
  if (isLiked.value) {
    // Titres likés -> collection
    return playLikedContext(idx)
  }
  // Playlist classique -> parent
  emit('play-in-context', { contextUri: props.item?.uri, offset: idx })
}
</script>

<template>
  <!-- h-full pour occuper la hauteur fournie par le parent -->
  <div class="flex flex-col h-full min-h-0">
    <!-- Header non scrollant -->
    <div class="pb-3 shrink-0">
      <div class="flex items-center gap-4">
        <img :src="cover" class="h-24 w-24 rounded object-cover" alt="" />
        <div>
          <h1 class="text-xl font-semibold">{{ item?.name || 'Playlist' }}</h1>
          <p class="text-sm text-dimmed">
            {{ rows.length }} / {{ item.tracks?.total ?? rows.length }} titres
          </p>
          <div class="mt-2">
            <UButton icon="i-lucide-play" @click="onHeaderPlay">Lire</UButton>
          </div>
        </div>
      </div>
      <p v-if="item?.description" class="mt-2 text-sm text-dimmed line-clamp-2">
        {{ item.description }}
      </p>
    </div>

    <!-- Zone scrollable interne -->
    <div
      class="flex-1 min-h-0 overflow-y-auto rounded-md border border-default divide-y divide-default"
      :style="{ paddingBottom: (playerHeight ?? 104) + 'px' }"
    >
      <div v-if="rows.length === 0" class="p-3 text-sm text-dimmed">Aucun titre.</div>

      <div
        v-for="(t, idx) in rows"
        :key="t.id"
        class="group flex items-center gap-3 p-2 hover:bg-elevated/40"
        @dblclick="onRowPlay(idx)"
      >
        <span class="w-8 text-center text-xs tabular-nums text-dimmed">{{ idx + 1 }}</span>

        <img
          :src="t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || 'https://via.placeholder.com/96x96?text=♪'"
          class="h-12 w-12 rounded object-cover"
          :alt="t.name"
        />

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ t.name }}</p>
          <p class="truncate text-xs text-dimmed">
            {{ (t.artists || []).map(a => a.name).join(', ') }}
          </p>
        </div>

        <span class="text-xs text-dimmed w-12 text-right">{{ ms(t.duration_ms) }}</span>

        <div class="ms-2 hidden items-center gap-1 group-hover:flex">
          <UButton icon="i-lucide-play" variant="ghost" size="xs" @click="onRowPlay(idx)" />
        </div>
      </div>

      <div v-if="hasMore" class="p-3">
        <UButton :loading="loadingMore" variant="soft" icon="i-lucide-chevrons-down" @click="$emit('load-more')">
          Charger plus
        </UButton>
      </div>
    </div>
  </div>
</template>
