<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  getDbPlaylist, removeDbPlaylistTrack, moveDbPlaylistTrack,
  deleteDbPlaylist, updateDbPlaylist,
  type DbPlaylist
} from '@/src/api/dbPlaylists'
import { resolveCoverUrl, sourceKey, type LibraryTrack } from '@/src/api/library'
import { addSavedTrack, removeSavedTrack } from '@/src/api/saved'

const props = defineProps<{ id: number | string; playerHeight?: number; currentKey?: string }>()
const emit = defineEmits<{
  (e: 'deleted'): void
  (e: 'changed'): void
  (e: 'play-track', track: LibraryTrack): void
  (e: 'play-all', payload: { mode: 'replace' | 'add'; source?: string }): void
  (e: 'download-track', track: LibraryTrack): void
}>()

const toast = useToast()
const loading = ref(false)
const playlist = ref<DbPlaylist | null>(null)
const tracks = ref<LibraryTrack[]>([])

async function load() {
  loading.value = true
  try {
    const pl = await getDbPlaylist(props.id)
    playlist.value = pl
    const t = (pl as any).tracks
    tracks.value = Array.isArray(t) ? t : (t?.items ?? [])
  } catch {
    toast.add({ title: 'Playlist introuvable', color: 'error' })
  } finally {
    loading.value = false
  }
}
watch(() => props.id, load, { immediate: true })

const cover = (o: any) => resolveCoverUrl(o?.coverUrl ?? o?.cover_url ?? o?.image)
const toTime = (ms?: number | null) => {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ── Actions ────────────────────────────────────────────────────────────── */
/** Délégué au parent → sélecteur de lecteur (la source peut avoir plusieurs lecteurs) */
function play(mode: 'replace' | 'add') {
  emit('play-all', { mode, source: playlist.value?.source as string | undefined })
}

async function removeTrack(t: LibraryTrack, i: number) {
  const tid = (t as any).id ?? (t as any).trackId ?? (t as any).sourceId
  try {
    await removeDbPlaylistTrack(props.id, tid)
    tracks.value.splice(i, 1)
    emit('changed')
  } catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
}

async function toggleLike(t: LibraryTrack) {
  const liked = !!(t as any).like
  try {
    if (liked) { await removeSavedTrack(sourceKey(t)); (t as any).like = false }
    else { await addSavedTrack(t); (t as any).like = true }
  } catch { toast.add({ title: 'Action impossible', color: 'error' }) }
}

async function move(i: number, dir: -1 | 1) {
  const to = i + dir
  if (to < 0 || to >= tracks.value.length) return
  const arr = [...tracks.value]
  const a = arr[i], b = arr[to]
  if (!a || !b) return
  arr[i] = b; arr[to] = a
  tracks.value = arr
  try { await moveDbPlaylistTrack(props.id, i, to); emit('changed') }
  catch { toast.add({ title: 'Réordonnancement impossible', color: 'error' }); load() }
}

async function onDelete() {
  if (!confirm(`Supprimer la playlist « ${playlist.value?.name} » ?`)) return
  try {
    await deleteDbPlaylist(props.id)
    toast.add({ title: 'Playlist supprimée', color: 'success' })
    emit('deleted')
  } catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
}

/* Renommage inline */
const editingName = ref(false)
const nameDraft = ref('')
function startRename() { nameDraft.value = playlist.value?.name ?? ''; editingName.value = true }
async function saveName() {
  const name = nameDraft.value.trim()
  editingName.value = false
  if (!name || name === playlist.value?.name) return
  try {
    await updateDbPlaylist(props.id, { name })
    if (playlist.value) playlist.value.name = name
    emit('changed')
  } catch { toast.add({ title: 'Renommage impossible', color: 'error' }) }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div class="pb-3 shrink-0">
      <div class="flex items-end gap-5">
        <div class="h-24 w-24 sm:h-36 sm:w-36 rounded-md overflow-hidden bg-elevated shrink-0 flex items-center justify-center"
          :class="(playlist as any)?.kind === 'album' ? '' : 'rounded-md'">
          <img v-if="cover(playlist)" :src="cover(playlist)!" class="h-full w-full object-cover" alt="" />
          <UIcon v-else :name="(playlist as any)?.kind === 'album' ? 'i-lucide-disc-3' : 'i-lucide-list-music'" class="size-10 text-dimmed" />
        </div>
        <div class="min-w-0 pb-1">
          <p class="text-xs uppercase tracking-widest text-dimmed mb-1">{{ (playlist as any)?.kind === 'album' ? 'Mon album' : 'Ma playlist' }}</p>
          <div v-if="!editingName" class="flex items-center gap-2">
            <h1 class="text-2xl font-bold leading-tight truncate">{{ playlist?.name || '—' }}</h1>
            <UButton icon="i-lucide-pencil" size="2xs" variant="ghost" color="neutral" @click="startRename" />
          </div>
          <UInput v-else v-model="nameDraft" autofocus class="max-w-xs" @keyup.enter="saveName" @blur="saveName" />
          <p class="mt-2 text-xs text-dimmed">{{ tracks.length }} titre{{ tracks.length !== 1 ? 's' : '' }}</p>
          <div class="mt-3 flex items-center gap-2">
            <UButton icon="i-lucide-play" size="sm" :disabled="!tracks.length" @click="play('replace')">Lire</UButton>
            <UButton icon="i-lucide-list-plus" size="sm" variant="soft" color="neutral" :disabled="!tracks.length" @click="play('add')">File</UButton>
            <UButton icon="i-lucide-trash-2" size="sm" variant="ghost" color="error" @click="onDelete">Supprimer</UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Pistes -->
    <div class="flex-1 min-h-0 overflow-y-auto" :style="{ paddingBottom: (playerHeight ?? 104) + 'px' }">
      <div v-if="loading" class="space-y-2 pt-2">
        <USkeleton v-for="i in 6" :key="i" class="h-12 w-full" />
      </div>
      <div v-else-if="!tracks.length" class="p-6 text-center text-dimmed text-sm">
        <UIcon name="i-lucide-list-x" class="size-8 mx-auto mb-2 opacity-40" />
        Playlist vide — ajoutez des titres depuis la recherche.
      </div>
      <div v-else class="space-y-1 pt-1">
        <div
          v-for="(t, i) in tracks"
          :key="((t as any).id ?? (t as any).sourceId ?? i) + '-' + i"
          class="group flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40"
          @dblclick="emit('play-track', t)"
        >
          <div class="w-5 flex items-center justify-end shrink-0">
            <UIcon v-if="isNowPlaying(t, props.currentKey)" name="i-lucide-audio-lines" class="size-4 text-primary animate-pulse group-hover:hidden" />
            <span v-else class="text-xs text-dimmed tabular-nums group-hover:hidden">{{ i + 1 }}</span>
            <UButton icon="i-lucide-play" size="2xs" variant="ghost" color="neutral" class="hidden group-hover:flex" @click.stop="emit('play-track', t)" />
          </div>
          <img v-if="cover(t)" :src="cover(t)!" class="h-9 w-9 rounded object-cover shrink-0" alt="" />
          <div v-else class="h-9 w-9 rounded bg-elevated flex items-center justify-center shrink-0"><UIcon name="i-lucide-music" class="size-4 text-dimmed" /></div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium" :class="{ 'text-primary': isNowPlaying(t, props.currentKey) }">{{ t.title }}</p>
            <p class="truncate text-xs text-dimmed">{{ t.artists?.join(', ') || '—' }}</p>
          </div>
          <UButton
            :icon="(t as any).like ? 'mdi:heart' : 'mdi:heart-outline'"
            size="2xs" variant="ghost"
            :color="(t as any).like ? 'primary' : 'neutral'"
            :title="(t as any).like ? 'Retirer des aimés' : 'Aimer'"
            class="shrink-0"
            @click="toggleLike(t)"
          />
          <span class="text-xs tabular-nums text-dimmed shrink-0">{{ toTime(t.durationMs ?? t.duration_ms) }}</span>
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <UButton v-if="isYoutube(t)" size="2xs" variant="ghost" color="neutral" icon="i-lucide-download" title="Télécharger" @click="emit('download-track', t)" />
            <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-chevron-up"   :disabled="i === 0"                  @click="move(i, -1)" />
            <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-chevron-down" :disabled="i === tracks.length - 1" @click="move(i, 1)" />
            <UButton size="2xs" variant="ghost" color="error"   icon="i-lucide-trash-2"        @click="removeTrack(t, i)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
