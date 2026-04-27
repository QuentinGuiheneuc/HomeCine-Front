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

/** Supprime les balises HTML d'une description Spotify (ex: <a href="…">…</a>) */
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim()

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
      <div class="flex items-end gap-5">
        <img :src="cover" class="h-36 w-36 rounded-md object-cover shadow-lg shrink-0" alt="" />
        <div class="min-w-0 pb-1">
          <p class="text-xs uppercase tracking-widest text-dimmed mb-1">Playlist</p>
          <h1 class="text-2xl font-bold leading-tight truncate">{{ item?.name || 'Playlist' }}</h1>
          <p v-if="item?.description" class="mt-1 text-xs text-dimmed line-clamp-2">{{ stripHtml(item.description) }}</p>
          <p class="mt-2 text-xs text-dimmed">
            {{ item.tracks?.total ?? rows.length }} titre{{ (item.tracks?.total ?? rows.length) !== 1 ? 's' : '' }}
            <template v-if="rows.length !== (item.tracks?.total ?? rows.length)">
              &nbsp;· {{ rows.length }} chargés
            </template>
          </p>
          <div class="mt-3 flex items-center gap-2">
            <UButton icon="i-lucide-play" size="sm" @click="onHeaderPlay">Lire</UButton>
            <UButton icon="i-lucide-shuffle" size="sm" variant="ghost" color="neutral" @click="onHeaderPlay" />
          </div>
        </div>
      </div>
    </div>

    <!-- Zone scrollable interne -->
    <div
      class="flex-1 min-h-0 overflow-y-auto"
      :style="{ paddingBottom: (playerHeight ?? 104) + 'px' }"
    >
      <!-- En-tête colonnes -->
      <div class="grid grid-cols-[2rem_2rem_1fr_1fr_4rem] gap-x-3 px-2 py-1.5 text-[11px] uppercase tracking-wider text-dimmed border-b border-default sticky top-0 bg-background/80 backdrop-blur z-10">
        <span class="text-center">#</span>
        <span />
        <span>Titre</span>
        <span class="hidden md:block">Album</span>
        <span class="text-right">Durée</span>
      </div>

      <div v-if="rows.length === 0" class="p-4 text-sm text-dimmed">Aucun titre.</div>

      <div
        v-for="(t, idx) in rows"
        :key="t.id"
        class="group grid grid-cols-[2rem_2rem_1fr_1fr_4rem] gap-x-3 items-center px-2 py-1.5 hover:bg-elevated/40 rounded cursor-default"
        @dblclick="onRowPlay(idx)"
      >
        <!-- Numéro / bouton play -->
        <div class="flex items-center justify-center">
          <span class="text-xs tabular-nums text-dimmed group-hover:hidden">{{ idx + 1 }}</span>
          <UButton
            icon="i-lucide-play"
            variant="ghost"
            color="neutral"
            size="xs"
            class="hidden group-hover:flex"
            @click.stop="onRowPlay(idx)"
          />
        </div>

        <!-- Miniature album -->
        <img
          :src="t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || 'https://via.placeholder.com/40x40?text=♪'"
          class="h-8 w-8 rounded object-cover"
          :alt="t.name"
        />

        <!-- Titre + artistes -->
        <div class="min-w-0">
          <p class="truncate text-sm font-medium leading-tight">{{ t.name }}</p>
          <p class="truncate text-xs text-dimmed">
            {{ (t.artists || []).map(a => a.name).join(', ') }}
          </p>
        </div>

        <!-- Album name -->
        <p class="hidden md:block truncate text-xs text-dimmed">{{ t.album?.name ?? '' }}</p>

        <!-- Durée -->
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
