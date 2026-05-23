<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { useLecteursWs } from '@/composables/useLecteursWs'

const { isLecteurSlideoverOpen, isQueueSlideoverOpen, activeLecteurId } = useDashboard()

/* ── WebSocket lecteurs ─────────────────────────────────────────────────── */

const ws = useLecteursWs()

/* Lecteur actif :
 *  1. Sélection manuelle via LecteurSlideover (activeLecteurId)
 *  2. Premier en lecture
 *  3. Premier alive
 *  4. Premier de la liste
 */
const activeLecteur = computed(() => {
  const list = ws.lecteurs.value
  if (activeLecteurId.value != null) {
    const selected = list.find(l => l.id === activeLecteurId.value)
    if (selected) return selected
  }
  return (
    list.find(l => l.playing && !l.paused) ??
    list.find(l => l.alive)               ??
    list[0]                               ??
    null
  )
})

/* ── Dérivés piste ──────────────────────────────────────────────────────── */

const track   = computed(() => activeLecteur.value?.track ?? null)
const cover   = computed(() =>
  track.value?.cover_url || 'https://via.placeholder.com/96x96.png?text=♪'
)
const title   = computed(() => track.value?.title ?? 'No track')
const artists = computed(() => (track.value?.artists ?? []).join(', '))
const duration = computed(() =>
  track.value?.duration_ms ??
  activeLecteur.value?.temp?.duration_ms ??
  0
)
/** Volume brut du serveur — peut être null si non renseigné */
const serverVolume = computed(() => activeLecteur.value?.volume ?? null)
const volume = ref(60)

watch(serverVolume, (v) => {
  if (v !== null) volume.value = v
}, { immediate: true })
/* ── Override optimiste play / pause ────────────────────────────────────── */

const _playOverride = ref<boolean | null>(null)

/* Efface l'override dès que le heartbeat confirme l'état attendu (~1 s) */
watch(
  () => activeLecteur.value?.playing,
  (playing) => {
    if (_playOverride.value !== null && playing === _playOverride.value)
      _playOverride.value = null
  }
)

const isPlaying = computed(() => {
  if (_playOverride.value !== null) return _playOverride.value
  const l = activeLecteur.value
  return l ? (l.playing && !l.paused) : false
})

/* ── Position (mise à jour par Heartbeat) ───────────────────────────────── */

const positionMs = ref(0)

watch(
  () => activeLecteur.value?.temp?.position_ms,
  (ms) => { if (ms != null) positionMs.value = ms },
  { immediate: true }
)

const toTime = (ms: number) => {
  const s  = Math.max(0, Math.floor(ms / 1000))
  const m  = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss.toString().padStart(2, '0')}`
}

/* ── Volume (local) ─────────────────────────────────────────────────────── */


const clamp  = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n))

const _setVolumeDebounced = useDebounceFn((value: number) => {
  ws.setVolume(activeLecteur.value?.id, clamp(value))
}, 200)

function setVolume(pct: number) {
  volume.value = clamp(pct)
  _setVolumeDebounced(volume.value)
}

const _savedVolume = ref<number>(60)
const isMuted      = ref<boolean>(false)

function toggleMute() {
  if (isMuted.value) {
    isMuted.value = false
    setVolume(_savedVolume.value)
  } else {
    _savedVolume.value = volume.value
    isMuted.value = true
    setVolume(0)
  }
}

const volumeIcon = computed(() => {
  if (isMuted.value)                      return 'i-lucide-volume-x'
  if (serverVolume.value === null)        return 'i-lucide-volume-1'   // inconnu → neutre
  if (volume.value === 0)                 return 'i-lucide-volume-x'
  if (volume.value < 30)                  return 'i-lucide-volume'
  if (volume.value < 70)                  return 'i-lucide-volume-1'
  return                                         'i-lucide-volume-2'
})
function onWheelVolume(e: WheelEvent) {
  const step  = e.shiftKey ? 10 : 5
  const delta = e.deltaY > 0 ? -step : step
  console.log('delta:', delta, volume.value, clamp(volume.value + delta))
  const next  = clamp(volume.value + delta)
  if (next !== volume.value) setVolume(next)
  e.preventDefault()
}

/* ── Shuffle / Repeat (valeurs serveur via LecteurState) ────────────────── */

const shuffle = computed(() => activeLecteur.value?.shuffle ?? false)
const repeat  = computed(() => activeLecteur.value?.repeat  ?? 'off')

function toggleShuffle() { ws.toggleShuffle(activeLecteur.value?.id) }
function cycleRepeat()   { ws.cycleRepeat(activeLecteur.value?.id) }

/* ── Actions ────────────────────────────────────────────────────────────── */

function togglePlay() {
  const l = activeLecteur.value
  if (!l) return
  _playOverride.value = !(l.playing && !l.paused)
  ws.togglePlayPause(l.id)
}

function prev() { ws.prev(activeLecteur.value?.id) }
function next() { ws.next(activeLecteur.value?.id) }

const _seekDebounced = useDebounceFn((position_ms: number) => {
  ws.seek(activeLecteur.value?.id, position_ms)
}, 250)

function onSeek(ms: number) {
  positionMs.value = Math.max(0, Math.min(ms, duration.value))
  _seekDebounced(positionMs.value)
}

/* ── Icône par type ─────────────────────────────────────────────────────── */

/** Couvre les types de lecteur ET les types de device Spotify (AVR, TV, SPEAKER…) */
function iconForType(type: string) {
  switch ((type ?? '').toUpperCase()) {
    // ── Lecteurs ──
    case 'SPOTIFY':       return 'mdi:spotify'
    case 'FILEPLAYER':    return 'mdi:file-music'
    case 'CONTROLINPUT':  return 'mdi:audio-input-rca'

    // ── Devices physiques (Spotify / future use) ──
    case 'AVR':           return 'material-symbols:audio-video-receiver-outline'
    case 'TV':            return 'material-symbols:tv-outline'
    case 'STB':           return 'material-symbols:set-top-box-outline'
    case 'COMPUTER':      return 'material-symbols:computer'
    case 'SMARTPHONE':    return 'material-symbols:smartphone'
    case 'TABLET':        return 'material-symbols:tablet-mac'
    case 'SPEAKER':       return 'material-symbols:speaker'
    case 'GAMECONSOLE':   return 'material-symbols:sports-esports'
    case 'CASTAUDIO':     return 'material-symbols:cast-audio'
    case 'CASTVIDEO':     return 'material-symbols:cast-connected'
    case 'AUTOMOBILE':    return 'material-symbols:directions-car'
    case 'SMARTWATCH':    return 'material-symbols:watch'
    case 'CHROMEBOOK':    return 'material-symbols:laptop-chromebook'
    case 'CARTHING':      return 'material-symbols:smart-display-outline'
    case 'AUDIODONGLE':   return 'material-symbols:usb'

    default:              return 'i-lucide-monitor-speaker'
  }
}
</script>

<template>
  <footer class="sticky bottom-0 z-40 border-t border-default bg-elevated/80 backdrop-blur supports-[backdrop-filter]:bg-elevated/60">

    <!-- ── Desktop : 3 colonnes ─────────────────────────────────────────── -->
    <div class="hidden md:block w-full px-4">
      <div class="w-full grid grid-cols-12 items-center gap-2 p-2">

        <!-- LEFT : info piste -->
        <div class="flex items-center gap-3 min-w-0 col-span-3">
          <img :src="cover" :alt="title" class="h-16 w-16 md:h-20 md:w-20 rounded object-cover shrink-0" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ title }}</p>
            <p class="truncate text-xs text-dimmed">{{ artists || '—' }}</p>
            <p v-if="activeLecteur" class="text-[11px] text-muted/70 mt-0.5">
              <span class="inline-flex items-center gap-1">
                <UIcon :name="iconForType(activeLecteur.device_type ?? activeLecteur.type)" class="w-3.5 h-3.5" />
                <span class="truncate">{{ activeLecteur.name }}</span>
                <UBadge v-if="!activeLecteur.alive" size="xs" color="error" variant="subtle">off</UBadge>
              </span>
            </p>
          </div>
        </div>

        <!-- CENTER : boutons + barre de progression -->
        <div class="col-span-6 flex flex-col items-center gap-1">
          <div class="flex items-center gap-4">
            <UButton
              :color="shuffle ? 'primary' : 'neutral'" variant="ghost" icon="i-lucide-shuffle" size="sm" square
              @click="toggleShuffle"
            />
            <UButton
              variant="ghost" color="neutral" icon="i-lucide-skip-back" size="sm" square
              :disabled="!activeLecteur?.alive"
              @click="prev"
            />
            <UButton
              size="xl" square class="rounded-full h-12 w-12 justify-center items-center"
              :disabled="!activeLecteur?.alive"
              @click="togglePlay"
            >
              <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="w-6 h-6" />
            </UButton>
            <UButton
              variant="ghost" color="neutral" icon="i-lucide-skip-forward" size="sm" square
              :disabled="!activeLecteur?.alive"
              @click="next"
            />
            <UButton
              :color="repeat !== 'off' ? 'primary' : 'neutral'" variant="ghost"
              :icon="repeat === 'track' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'"
              size="sm" square
              @click="cycleRepeat"
            />
          </div>

          <div class="flex items-center gap-3 w-full">
            <span class="text-xs tabular-nums text-dimmed w-10 text-right">{{ toTime(positionMs) }}</span>
            <div class="flex-1">
              <input
                type="range" min="0" :max="duration" :value="positionMs"
                class="w-full accent-current h-1.5 range-primary-0"
                @input="onSeek(($event.target as HTMLInputElement).valueAsNumber)"
              />
            </div>
            <span class="text-xs tabular-nums text-dimmed w-10">{{ toTime(duration) }}</span>
          </div>
        </div>

        <!-- RIGHT : queue + type + volume -->
        <div class="col-span-3 flex items-center justify-end gap-2">
          <UButton variant="ghost" color="neutral" icon="i-lucide-list-music" size="lg" square @click="isQueueSlideoverOpen = true" />
          <UButton
            variant="ghost"
            :color="activeLecteur ? 'primary' : 'neutral'"
            :icon="iconForType(activeLecteur?.device_type ?? activeLecteur?.type ?? '')"
            size="lg" square
            @click="isLecteurSlideoverOpen = true"
          />
          <div class="flex items-center gap-2" @wheel.prevent="onWheelVolume">
            <UButton
              variant="ghost" color="neutral"
              :icon="volumeIcon"
              size="lg" square
              @click="toggleMute"
            />
            <input
              type="range" min="0" max="100" :value="volume"
              class="w-24 xl:w-32 accent-current h-2 range-primary-0"
              @input="setVolume(($event.target as HTMLInputElement).valueAsNumber)"
            />
          </div>
        </div>

      </div>
    </div>

    <!-- ── Mobile : compact ─────────────────────────────────────────────── -->
    <div class="md:hidden w-full px-3 py-2">
      <div class="flex items-center gap-3">
        <img :src="cover" :alt="title" class="h-12 w-12 rounded object-cover shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ title }}</p>
          <p class="truncate text-xs text-dimmed">{{ artists || '—' }}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <UButton variant="ghost" color="neutral" icon="i-lucide-skip-back"    size="sm" square @click="prev" />
          <UButton size="lg" square class="rounded-full h-11 w-11 justify-center items-center" @click="togglePlay">
            <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="w-5 h-5" />
          </UButton>
          <UButton variant="ghost" color="neutral" icon="i-lucide-skip-forward" size="sm" square @click="next" />
        </div>
      </div>
      <input
        type="range" min="0" :max="duration" :value="positionMs"
        class="w-full accent-current h-1 range-primary-0 mt-2"
        @input="onSeek(($event.target as HTMLInputElement).valueAsNumber)"
      />
    </div>

  </footer>
</template>
