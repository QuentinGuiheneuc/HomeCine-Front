<script setup lang="ts">
import { ref, watch } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import {
  getSavedTracks, removeSavedTrack, playSavedTracks,
  getSavedArtists, removeSavedArtist
} from '@/src/api/saved'
import { resolveCoverUrl, resolveId, type LibraryTrack, type LibraryArtist } from '@/src/api/library'

const props = defineProps<{ kind: 'tracks' | 'artists'; playerHeight?: number; currentKey?: string }>()
const emit = defineEmits<{ (e: 'select-artist', a: LibraryArtist): void; (e: 'changed'): void; (e: 'download-track', t: LibraryTrack): void }>()

const toast = useToast()
const loading = ref(false)
const tracks  = ref<LibraryTrack[]>([])
const artists = ref<LibraryArtist[]>([])

/* Pagination (Charger plus / scroll infini) */
const PAGE     = 100
const page     = ref(1)
const hasMore  = ref(false)
const more     = ref(false)

async function load() {
  loading.value = true
  page.value = 1
  hasMore.value = false
  try {
    if (props.kind === 'tracks') {
      const r = await getSavedTracks(undefined, { page: 1, pageSize: PAGE }); tracks.value = r.items; hasMore.value = r.hasMore
    } else {
      const r = await getSavedArtists(undefined, { page: 1, pageSize: PAGE }); artists.value = r.items; hasMore.value = r.hasMore
    }
  } catch {
    toast.add({ title: 'Chargement impossible', color: 'error' })
  } finally { loading.value = false }
}
async function loadMore() {
  if (!hasMore.value || more.value) return
  more.value = true
  try {
    const next = page.value + 1
    if (props.kind === 'tracks') {
      const r = await getSavedTracks(undefined, { page: next, pageSize: PAGE }); tracks.value = [...tracks.value, ...r.items]; hasMore.value = r.hasMore
    } else {
      const r = await getSavedArtists(undefined, { page: next, pageSize: PAGE }); artists.value = [...artists.value, ...r.items]; hasMore.value = r.hasMore
    }
    page.value = next
  } catch { toast.add({ title: 'Chargement impossible', color: 'error' }) }
  finally { more.value = false }
}
watch(() => props.kind, load, { immediate: true })

const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting && hasMore.value && !more.value) loadMore()
})

const cover = (o: any) => resolveCoverUrl(o?.coverUrl ?? o?.cover_url ?? o?.image)
const toTime = (ms?: number | null) => {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function play(mode: 'replace' | 'add') {
  try {
    await playSavedTracks(mode)
    toast.add({ title: mode === 'replace' ? 'Lecture lancée' : 'Ajouté à la file', color: 'success', icon: 'i-lucide-play' })
  } catch { toast.add({ title: 'Action impossible', color: 'error' }) }
}

async function removeTrack(t: LibraryTrack, i: number) {
  try { await removeSavedTrack(resolveId(t)); tracks.value.splice(i, 1); emit('changed') }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
}
async function unfollow(a: LibraryArtist, i: number) {
  try { await removeSavedArtist(resolveId(a)); artists.value.splice(i, 1); emit('changed') }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div class="pb-3 shrink-0 flex items-end gap-5">
      <div class="h-24 w-24 sm:h-36 sm:w-36 rounded-md flex items-center justify-center shrink-0"
        :class="kind === 'tracks' ? 'bg-gradient-to-br from-pink-500 to-purple-600' : 'bg-gradient-to-br from-sky-500 to-indigo-600'">
        <UIcon :name="kind === 'tracks' ? 'i-lucide-heart' : 'i-lucide-user-round'" class="size-10 text-white" />
      </div>
      <div class="min-w-0 pb-1">
        <p class="text-xs uppercase tracking-widest text-dimmed mb-1">Bibliothèque</p>
        <h1 class="text-2xl font-bold leading-tight">{{ kind === 'tracks' ? 'Titres aimés' : 'Artistes suivis' }}</h1>
        <p class="mt-2 text-xs text-dimmed">
          {{ kind === 'tracks' ? tracks.length + ' titre' + (tracks.length !== 1 ? 's' : '') : artists.length + ' artiste' + (artists.length !== 1 ? 's' : '') }}
        </p>
        <div v-if="kind === 'tracks'" class="mt-3 flex items-center gap-2">
          <UButton icon="i-lucide-play" size="sm" :disabled="!tracks.length" @click="play('replace')">Lire</UButton>
          <UButton icon="i-lucide-list-plus" size="sm" variant="soft" color="neutral" :disabled="!tracks.length" @click="play('add')">File</UButton>
        </div>
      </div>
    </div>

    <!-- Contenu -->
    <div class="flex-1 min-h-0 overflow-y-auto" :style="{ paddingBottom: (playerHeight ?? 104) + 'px' }">
      <div v-if="loading" class="space-y-2 pt-2"><USkeleton v-for="i in 6" :key="i" class="h-12 w-full" /></div>

      <!-- Titres -->
      <template v-else-if="kind === 'tracks'">
        <div v-if="!tracks.length" class="p-6 text-center text-dimmed text-sm">
          <UIcon name="i-lucide-heart-off" class="size-8 mx-auto mb-2 opacity-40" />Aucun titre aimé.
        </div>
        <div v-else class="space-y-1 pt-1">
          <div v-for="(t, i) in tracks" :key="resolveId(t) + '-' + i" class="group flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40">
            <div class="w-5 flex items-center justify-end shrink-0">
              <UIcon v-if="isNowPlaying(t, props.currentKey)" name="i-lucide-audio-lines" class="size-4 text-primary animate-pulse" />
              <span v-else class="text-xs text-dimmed tabular-nums">{{ i + 1 }}</span>
            </div>
            <img v-if="cover(t)" :src="cover(t)!" class="h-9 w-9 rounded object-cover shrink-0" alt="" />
            <div v-else class="h-9 w-9 rounded bg-elevated flex items-center justify-center shrink-0"><UIcon name="i-lucide-music" class="size-4 text-dimmed" /></div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" :class="{ 'text-primary': isNowPlaying(t, props.currentKey) }">{{ t.title }}</p>
              <p class="truncate text-xs text-dimmed">{{ t.artists?.join(', ') || '—' }}</p>
            </div>
            <span class="text-xs tabular-nums text-dimmed shrink-0">{{ toTime(t.durationMs ?? t.duration_ms) }}</span>
            <UButton v-if="isYoutube(t)" size="2xs" variant="ghost" color="neutral" icon="i-lucide-download" title="Télécharger" class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click="emit('download-track', t)" />
            <UButton size="2xs" variant="ghost" color="error" icon="i-lucide-heart-off" class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click="removeTrack(t, i)" />
          </div>
        </div>
      </template>

      <!-- Artistes -->
      <template v-else>
        <div v-if="!artists.length" class="p-6 text-center text-dimmed text-sm">
          <UIcon name="i-lucide-user-x" class="size-8 mx-auto mb-2 opacity-40" />Aucun artiste suivi.
        </div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          <div v-for="(ar, i) in artists" :key="resolveId(ar) + '-' + i" class="group text-center">
            <button class="w-full" @click="emit('select-artist', ar)">
              <div class="aspect-square rounded-full overflow-hidden bg-elevated mx-auto">
                <img v-if="cover(ar)" :src="cover(ar)!" class="h-full w-full object-cover" alt="" />
                <div v-else class="h-full w-full flex items-center justify-center"><UIcon name="i-lucide-user-round" class="size-8 text-dimmed" /></div>
              </div>
              <p class="text-xs font-medium truncate mt-1">{{ ar.name }}</p>
            </button>
            <UButton size="2xs" variant="ghost" color="error" icon="i-lucide-user-x" class="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" @click="unfollow(ar, i)">Ne plus suivre</UButton>
          </div>
        </div>
      </template>

      <!-- Charger plus (+ capteur de scroll infini) -->
      <div v-if="!loading && hasMore" ref="sentinel" class="flex justify-center py-3">
        <UButton size="sm" variant="soft" color="neutral" :loading="more" @click="loadMore">
          {{ more ? 'Chargement…' : 'Charger plus' }}
        </UButton>
      </div>
    </div>
  </div>
</template>
