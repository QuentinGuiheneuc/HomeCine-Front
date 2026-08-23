<script setup lang="ts">
import { ref, computed } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import { resolveCoverUrl, type LibraryTrack } from '@/src/api/library'

/**
 * Vue liste de pistes générique :
 * - dossiers fileplayer (categories) et « Tous les titres » (trackliste) → lecture seule
 * - genre (`editable`) → renommage, pochette, suppression, retrait de piste
 * Actions par piste : lire / aimer / ajouter à la file / ajouter à une collection.
 */
const props = defineProps<{
  title: string
  eyebrow?: string
  icon?: string
  cover?: string | null
  tracks: LibraryTrack[]
  loading?: boolean
  playerHeight?: number
  editable?: boolean        // affiche les contrôles d'édition (renommer / pochette / supprimer)
  hasMore?: boolean         // d'autres pages disponibles
  loadingMore?: boolean     // chargement d'une page suivante en cours
  currentKey?: string       // clé de la piste en cours de lecture
}>()
const emit = defineEmits<{
  (e: 'play-track', track: LibraryTrack): void
  (e: 'save-track', track: LibraryTrack): void
  (e: 'enqueue-track', track: LibraryTrack): void
  (e: 'add-to-playlist', track: LibraryTrack): void
  (e: 'play-all'): void
  (e: 'rename', name: string): void
  (e: 'set-cover', url: string): void
  (e: 'delete'): void
  (e: 'remove-track', track: LibraryTrack): void
  (e: 'enrich-track', track: LibraryTrack): void
  (e: 'enrich-all'): void
  (e: 'load-more'): void
  (e: 'download-track', track: LibraryTrack): void
}>()

const isFp = (t: any) => (t?.source ?? '').toLowerCase() === 'fileplayer'
const hasFileplayer = computed(() => props.tracks.some(isFp))

/* Scroll infini : un capteur en bas déclenche le chargement de la page suivante */
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting && props.hasMore && !props.loadingMore) emit('load-more')
})

const cover = (o: any) => resolveCoverUrl(o?.coverUrl ?? o?.cover_url ?? o?.image)
const toTime = (ms?: number | null) => {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* Renommage inline */
const editingName = ref(false)
const nameDraft   = ref('')
function startRename() { nameDraft.value = props.title; editingName.value = true }
function saveName() {
  const name = nameDraft.value.trim()
  editingName.value = false
  if (name && name !== props.title) emit('rename', name)
}
/* Pochette (saisie d'URL) */
function editCover() {
  const url = window.prompt('URL de la pochette', props.cover ?? '')
  if (url != null) emit('set-cover', url.trim())
}
function onDelete() {
  if (window.confirm(`Supprimer « ${props.title} » ?`)) emit('delete')
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div class="pb-3 shrink-0">
      <div class="flex items-end gap-5">
        <div
          class="group/cover relative h-24 w-24 sm:h-36 sm:w-36 rounded-md overflow-hidden bg-elevated shrink-0 flex items-center justify-center"
          :class="props.editable ? 'cursor-pointer' : ''"
          @click="props.editable && editCover()"
        >
          <img v-if="props.cover" :src="props.cover" class="h-full w-full object-cover" alt="" />
          <UIcon v-else :name="props.icon || 'i-lucide-folder'" class="size-10 text-dimmed" />
          <div v-if="props.editable" class="absolute inset-0 bg-black/50 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center">
            <UIcon name="i-lucide-image" class="size-6 text-white" />
          </div>
        </div>
        <div class="min-w-0 pb-1">
          <p class="text-xs uppercase tracking-widest text-dimmed mb-1">{{ props.eyebrow || 'Pistes' }}</p>
          <div v-if="props.editable && editingName" class="flex items-center">
            <UInput v-model="nameDraft" autofocus class="max-w-xs" @keyup.enter="saveName" @blur="saveName" />
          </div>
          <div v-else class="flex items-center gap-2">
            <h1 class="text-2xl font-bold leading-tight truncate">{{ props.title || '—' }}</h1>
            <UButton v-if="props.editable" icon="i-lucide-pencil" size="2xs" variant="ghost" color="neutral" @click="startRename" />
          </div>
          <p class="mt-2 text-xs text-dimmed">{{ props.tracks.length }} titre{{ props.tracks.length !== 1 ? 's' : '' }}</p>
          <div class="mt-3 flex items-center gap-2 flex-wrap">
            <UButton icon="i-lucide-play" size="sm" :disabled="!props.tracks.length" @click="emit('play-all')">Lire</UButton>
            <UButton v-if="hasFileplayer" icon="i-lucide-wand-sparkles" size="sm" variant="soft" color="neutral" @click="emit('enrich-all')">Enrichir tout</UButton>
            <UButton v-if="props.editable" icon="i-lucide-image" size="sm" variant="soft" color="neutral" @click="editCover">Pochette</UButton>
            <UButton v-if="props.editable" icon="i-lucide-trash-2" size="sm" variant="ghost" color="error" @click="onDelete">Supprimer</UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Pistes -->
    <div class="flex-1 min-h-0 overflow-y-auto" :style="{ paddingBottom: (props.playerHeight ?? 104) + 'px' }">
      <div v-if="props.loading" class="space-y-2 pt-2">
        <USkeleton v-for="i in 8" :key="i" class="h-12 w-full" />
      </div>
      <div v-else-if="!props.tracks.length" class="p-6 text-center text-dimmed text-sm">
        <UIcon name="i-lucide-list-x" class="size-8 mx-auto mb-2 opacity-40" />
        Aucune piste.
      </div>
      <div v-else class="space-y-1 pt-1">
        <div
          v-for="(t, i) in props.tracks"
          :key="((t as any).sourceId ?? (t as any).id ?? t.uri ?? i) + '-' + i"
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
            @click="emit('save-track', t)"
          />
          <span class="text-xs tabular-nums text-dimmed shrink-0">{{ toTime(t.durationMs ?? t.duration_ms) }}</span>
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <UButton v-if="isFp(t)" size="2xs" variant="ghost" color="neutral" icon="i-lucide-wand-sparkles" title="Enrichir (tags + pochette)" @click="emit('enrich-track', t)" />
            <UButton v-if="isYoutube(t)" size="2xs" variant="ghost" color="neutral" icon="i-lucide-download" title="Télécharger" @click="emit('download-track', t)" />
            <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-list-plus"   title="Ajouter à la file"        @click="emit('enqueue-track', t)" />
            <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-folder-plus" title="Ajouter à une collection" @click="emit('add-to-playlist', t)" />
            <UButton v-if="props.editable" size="2xs" variant="ghost" color="error" icon="i-lucide-trash-2" title="Retirer du genre" @click="emit('remove-track', t)" />
          </div>
        </div>

        <!-- Charger plus (+ capteur de scroll infini) -->
        <div v-if="props.hasMore" ref="sentinel" class="flex justify-center py-3">
          <UButton size="sm" variant="soft" color="neutral" :loading="props.loadingMore" @click="emit('load-more')">
            {{ props.loadingMore ? 'Chargement…' : 'Charger plus' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
