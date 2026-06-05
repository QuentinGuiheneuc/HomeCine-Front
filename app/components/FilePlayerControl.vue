<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { useLecteursWs } from '@/composables/useLecteursWs'

/**
 * Contrôle live d'un FilePlayer (cf. app/API.md — Contrat FilePlayer).
 * Pilote un lecteur déjà démarré via le WebSocket Lecteur.* (useLecteursWs).
 */
const props = defineProps<{ lecteurId: number; alive?: boolean }>()

const ws = useLecteursWs()

/* ── État live du lecteur ────────────────────────────────────────────────── */

const lecteur = computed(() => ws.lecteursById.value[props.lecteurId] ?? null)
const queue   = computed(() => ws.queuesById.value[props.lecteurId] ?? lecteur.value?.queue ?? [])

const isPlaying = computed(() => lecteur.value?.playing ?? false)
const track     = computed(() => lecteur.value?.track ?? null)
const shuffle   = computed(() => lecteur.value?.shuffle ?? false)
const repeat    = computed(() => lecteur.value?.repeat ?? 'off')

/* ── Position / durée ────────────────────────────────────────────────────── */

const positionMs = ref(0)
watch(() => lecteur.value?.temp?.position_ms, (ms) => { if (ms != null) positionMs.value = ms }, { immediate: true })
const durationMs = computed(() => track.value?.duration_ms ?? lecteur.value?.temp?.duration_ms ?? 0)

const toTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const _seekDebounced = useDebounceFn((p: number) => ws.seek(props.lecteurId, p), 250)
function onSeek(ms: number) {
  positionMs.value = Math.max(0, Math.min(ms, durationMs.value))
  _seekDebounced(positionMs.value)
}

/* ── Volume ──────────────────────────────────────────────────────────────── */

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n))
const volume = ref(60)
watch(() => lecteur.value?.volume, (v) => { if (v != null) volume.value = v }, { immediate: true })

const _setVolumeDebounced = useDebounceFn((v: number) => ws.setVolume(props.lecteurId, clamp(v)), 200)
function setVolume(pct: number) {
  volume.value = clamp(pct)
  _setVolumeDebounced(volume.value)
}

/* ── Transport ───────────────────────────────────────────────────────────── */

const togglePlay   = () => ws.togglePlayPause(props.lecteurId)
const next         = () => ws.next(props.lecteurId)
const prev         = () => ws.prev(props.lecteurId)
const toggleShuffle = () => ws.toggleShuffle(props.lecteurId)
const cycleRepeat   = () => ws.cycleRepeat(props.lecteurId)

/* ── Queue ───────────────────────────────────────────────────────────────── */

const newFile = ref('')

function addFile() {
  const path = newFile.value.trim()
  if (!path) return
  ws.addToQueue(props.lecteurId, [path])
  newFile.value = ''
}
function removeAt(index: number) {
  ws.removeFromQueue(props.lecteurId, index)
}
function moveUp(index: number) {
  if (index <= 0) return
  ws.moveInQueue(props.lecteurId, index, index - 1)
}
function moveDown(index: number) {
  if (index >= queue.value.length - 1) return
  ws.moveInQueue(props.lecteurId, index, index + 1)
}
function playFromQueue(uri: string) {
  ws.play(props.lecteurId, uri)
}

/* ── Refresh queue à l'apparition ────────────────────────────────────────── */

onMounted(() => {
  if (props.alive) ws.getQueue(props.lecteurId)
})
</script>

<template>
  <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">Contrôle FilePlayer</h3>
      <UBadge :color="alive ? 'primary' : 'neutral'" variant="subtle" class="text-[10px]">
        {{ alive ? 'En ligne' : 'Hors ligne' }}
      </UBadge>
    </div>

    <!-- Lecteur arrêté -->
    <UAlert
      v-if="!alive"
      color="neutral"
      icon="i-lucide-power-off"
      title="Lecteur arrêté"
      description="Démarrez le lecteur pour accéder aux contrôles de lecture."
    />

    <template v-else>
      <!-- Now playing -->
      <div class="flex items-center gap-3">
        <img
          v-if="track?.cover_url"
          :src="track.cover_url"
          class="h-16 w-16 rounded object-cover shrink-0"
        />
        <div v-else class="h-16 w-16 rounded bg-elevated flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-music" class="w-6 h-6 text-dimmed" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ track?.title ?? 'Aucune piste' }}</p>
          <p class="truncate text-xs text-dimmed">{{ (track?.artists ?? []).join(', ') || '—' }}</p>
          <p v-if="track?.album" class="truncate text-[11px] text-muted">{{ track.album }}</p>
        </div>
      </div>

      <!-- Barre de progression -->
      <div class="flex items-center gap-2">
        <span class="text-[11px] tabular-nums text-dimmed w-10 text-right">{{ toTime(positionMs) }}</span>
        <input
          type="range" min="0" :max="durationMs || 1" :value="positionMs"
          class="flex-1 accent-current h-1.5 range-primary-0"
          @input="onSeek(($event.target as HTMLInputElement).valueAsNumber)"
        />
        <span class="text-[11px] tabular-nums text-dimmed w-10">{{ toTime(durationMs) }}</span>
      </div>

      <!-- Transport -->
      <div class="flex items-center justify-center gap-3">
        <UButton :color="shuffle ? 'primary' : 'neutral'" variant="ghost" icon="i-lucide-shuffle" size="sm" square @click="toggleShuffle" />
        <UButton variant="ghost" color="neutral" icon="i-lucide-skip-back" size="sm" square @click="prev" />
        <UButton size="lg" square class="rounded-full h-11 w-11 justify-center items-center" @click="togglePlay">
          <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="w-5 h-5" />
        </UButton>
        <UButton variant="ghost" color="neutral" icon="i-lucide-skip-forward" size="sm" square @click="next" />
        <UButton
          :color="repeat !== 'off' ? 'primary' : 'neutral'" variant="ghost"
          :icon="repeat === 'track' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'"
          size="sm" square @click="cycleRepeat"
        />
      </div>

      <!-- Volume -->
      <div class="flex items-center gap-2 max-w-sm mx-auto w-full">
        <UIcon :name="volume === 0 ? 'i-lucide-volume-x' : volume < 50 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'" class="w-4 h-4 shrink-0" />
        <input
          type="range" min="0" max="100" :value="volume"
          class="flex-1 accent-current h-1.5 range-primary-0"
          @input="setVolume(($event.target as HTMLInputElement).valueAsNumber)"
        />
        <span class="text-xs tabular-nums w-10 text-right">{{ volume }}%</span>
      </div>

      <!-- Queue -->
      <div class="space-y-2 pt-2 border-t border-default">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-dimmed">File d'attente · {{ queue.length }}</h4>
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-refresh-ccw" @click="ws.getQueue(lecteurId)" />
        </div>

        <!-- Ajout d'un fichier -->
        <div class="flex gap-2">
          <UInput
            v-model="newFile"
            icon="i-lucide-file-music"
            placeholder="/data/morceau.flac"
            class="flex-1"
            @keyup.enter="addFile"
          />
          <UButton icon="i-lucide-plus" color="primary" :disabled="!newFile.trim()" @click="addFile">Ajouter</UButton>
        </div>

        <!-- Liste -->
        <div v-if="queue.length" class="space-y-1 max-h-64 overflow-y-auto pr-1">
          <div
            v-for="(item, index) in queue"
            :key="item.uri + index"
            class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-elevated/50 group"
          >
            <span class="text-xs text-dimmed tabular-nums w-5 text-right shrink-0">{{ index + 1 }}</span>
            <button class="flex-1 min-w-0 text-left" @click="playFromQueue(item.uri)">
              <p class="truncate text-sm">{{ item.title }}</p>
              <p class="truncate text-xs text-dimmed">{{ item.artists.join(', ') || '—' }}</p>
            </button>
            <span class="text-[11px] tabular-nums text-dimmed shrink-0">{{ toTime(item.duration_ms) }}</span>
            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-chevron-up"   :disabled="index === 0"               @click="moveUp(index)" />
              <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-chevron-down" :disabled="index === queue.length - 1" @click="moveDown(index)" />
              <UButton size="2xs" variant="ghost" color="error"   icon="i-lucide-trash-2"       @click="removeAt(index)" />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-dimmed italic text-center py-4">File d'attente vide</p>
      </div>
    </template>
  </UPageCard>
</template>
