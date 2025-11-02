<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import http from '@/src/lib/https'
import type { AxiosError, AxiosResponse } from 'axios'

const { isDeviceSlideoverOpen } = useDashboard()
/** ===== Types (subset de ta réponse API) ===== */
type Image = { url: string; width: number; height: number }
type Artist = { id: string; name: string }
type Album = { id: string; name: string; images: Image[] }
type Item = { id: string; name: string; duration_ms: number; artists: Artist[]; album: Album }
type Device = {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  supports_volume: boolean
  type: 'Computer' | 'Smartphone' | 'Speaker' | string
  volume_percent: number
}
type PlaybackResponse = {
  device: Device
  shuffle_state: boolean
  smart_shuffle?: boolean
  repeat_state: 'off'|'context'|'track'
  is_playing: boolean
  timestamp: number
  progress_ms: number
  item: Item | null
  currently_playing_type: 'track' | string
}

/** ===== State ===== */
const playback = ref<PlaybackResponse | null>(null)
const track = computed(() => playback.value?.item ?? null)
const cover = computed(() => track.value?.album?.images?.[1]?.url || track.value?.album?.images?.[0]?.url || 'https://via.placeholder.com/96x96.png?text=♪')
const title = computed(() => track.value?.name ?? 'No track')
const artists = computed(() => (track.value?.artists ?? []).map(a => a.name).join(', '))
const duration = computed(() => track.value?.duration_ms ?? 0)

const isPlaying = ref(false)
const shuffle = ref(false)
const repeat = ref<'off'|'context'|'track'>('off')
const positionMs = ref(0)
const volume = ref<number>(60)
const device = ref<Device | null>(null)

/** Helpers temps mm:ss */
const toTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss.toString().padStart(2, '0')}`
}

const progress = computed({
  get: () => duration.value ? Math.min(100, Math.max(0, (positionMs.value / duration.value) * 100)) : 0,
  set: (pct: number) => { positionMs.value = Math.round((pct / 100) * (duration.value || 0)) }
})

/** ===== Fetch initial & sync ===== */
async function loadPlayback() {
  try {
    // si http est un AxiosInstance :
    const res: AxiosResponse<PlaybackResponse> = await http.get<PlaybackResponse>('/spotify/player', {
      withCredentials: true, // si ton API utilise des cookies
      // baseURL: 'http://192.168.1.19:3007', // si non défini dans l'instance
    })

    const data = res.data

    playback.value   = data
    device.value     = data.device
    isPlaying.value  = data.is_playing
    shuffle.value    = !!data.shuffle_state
    repeat.value     = data.repeat_state
    positionMs.value = data.progress_ms ?? 0
    volume.value     = clamp(data.device?.volume_percent ?? 0, 0, 100)
  } catch (err) {
    const e = err as AxiosError
    console.error('loadPlayback failed:', e.response?.status, e.response?.data || e.message)
    // Optionnel: afficher un toast / marquer un état d’erreur
    // errorMsg.value = 'Impossible de récupérer le player'
  }
}
onMounted(loadPlayback)

/** Tick local toutes les 1s si lecture en cours */
let tickId: ReturnType<typeof setInterval> | null = null
watch([isPlaying, duration], ([playing]) => {
  if (tickId) { clearInterval(tickId); tickId = null }
  if (playing && duration.value > 0) {
    tickId = setInterval(() => {
      positionMs.value = Math.min(duration.value, positionMs.value + 1000)
    }, 1000)
  }
})
onBeforeUnmount(() => { if (tickId) clearInterval(tickId) })

/** Poll serveur toutes les 5s pour resynchroniser */
const pollId = setInterval(() => { loadPlayback().catch(() => {}) }, 5000)
onBeforeUnmount(() => clearInterval(pollId))

/** ===== Actions Spotify (adapter URLs à ton backend) ===== */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function togglePlay() {
  if (!track.value) return
  if (isPlaying.value) await http.put('/spotify/devices/pause')
  else await http.put('/spotify/devices/play')
  isPlaying.value = !isPlaying.value
  await sleep(800)
  await loadPlayback()
}
async function prev() {
  await http.post('/spotify/devices/previous')
  await sleep(800)
  await loadPlayback()
}
async function next() {
  await http.post('/spotify/devices/next')
  await sleep(800)
  await loadPlayback()
}
async function toggleShuffle() {
  shuffle.value = !shuffle.value
  await http.put('/spotify/devices/shuffle', { query: { state: String(shuffle.value) } })
  await sleep(800)
  await loadPlayback()
}
async function cycleRepeat() {
  repeat.value = repeat.value === 'off' ? 'context' : repeat.value === 'context' ? 'track' : 'off'
  await http.put('/spotify/devices/repeat', { query: { state: repeat.value } })
  await sleep(800)
  await loadPlayback()
}
const seekDebounced = useDebounceFn(async (ms: number) => {
  await http.put('/spotify/devices/seek', { query: { position_ms: ms } })
  await loadPlayback()
}, 250)
function onSeek(pct: number) {
  progress.value = pct
  seekDebounced(positionMs.value)
}

const setVolumeDebounced = useDebounceFn(async (pct: number) => {
  const d = device.value
  if (!d || !d.supports_volume) return

  const volume = clamp(pct, 0, 100)
  await http.put('/spotify/devices/volume', { device_id: d.id, volume_percent: volume })
  await sleep(800)
  await loadPlayback()
}, 200)
function setVolume(pct: number) {
  if (!device.value?.supports_volume) return
  volume.value = clamp(pct, 0, 100) // UI optimiste
  setVolumeDebounced(volume.value) // appel API debouncé
}

/** Wheel volume (optionnel) */
const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n))
function onWheelMaster(e: WheelEvent) {
  const step = e.shiftKey ? 10 : 5
  const delta = e.deltaY > 0 ? -step : step
  const nv = clamp(volume.value + delta)
  if (nv !== volume.value) setVolume(nv)
  e.preventDefault()
}
</script>

<template>
  <footer class="sticky bottom-0 z-40 border-t border-default bg-elevated/80 backdrop-blur supports-[backdrop-filter]:bg-elevated/60">
    <div class="w-full px-4">
      <div class="w-full grid grid-cols-1 md:grid-cols-12 items-center gap-2 p-2">
        <!-- LEFT -->
        <div class="flex items-center gap-3 min-w-0 md:col-span-3 xl:col-span-2">
          <img :src="cover" :alt="title" class="h-16 w-16 md:h-20 md:w-20 rounded object-cover" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ title }}</p>
            <p class="truncate text-xs text-dimmed">{{ artists || '—' }}</p>
            <p v-if="device" class="truncate text-[11px] text-muted/70">
              {{ device.type }} — {{ device.name }}
            </p>
          </div>
          <UButton icon="i-lucide-heart" variant="ghost" color="neutral" square />
        </div>

        <!-- CENTER -->
        <div class="md:col-span-6 xl:col-span-8 flex flex-col items-center gap-3">
          <div class="flex items-center gap-3">
            <UButton :color="shuffle ? 'primary' : 'neutral'" variant="ghost" icon="i-lucide-shuffle" size="sm" square @click="toggleShuffle" />
            <UButton variant="ghost" color="neutral" icon="i-lucide-skip-back" size="sm" square @click="prev" />
            <UButton :icon="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" size="xl" class="rounded-full h-12 w-12 justify-center items-center" @click="togglePlay" />
            <UButton variant="ghost" color="neutral" icon="i-lucide-skip-forward" size="sm" square @click="next" />
            <UButton :color="repeat !== 'off' ? 'primary' : 'neutral'" variant="ghost" :icon="repeat === 'track' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'" size="sm" square @click="cycleRepeat" />
          </div>

          <div class="flex items-center gap-3 w-full max-w-3xl">
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

        <!-- RIGHT -->
        <div class="md:col-span-3 xl:col-span-2 flex items-center justify-end gap-2">
          <UButton variant="ghost" color="neutral" icon="i-lucide-list-music" square />
          <UButton variant="ghost" color="neutral" icon="i-lucide-monitor-speaker" square @click="isDeviceSlideoverOpen = true" />
          <div class="flex items-center gap-2 w-40 max-w-[12rem]" @wheel.prevent="onWheelMaster">
            <UButton
              variant="ghost" color="neutral"
              :icon="volume === 0 ? 'i-lucide-volume-x' : volume < 50 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'"
              square
              @click="setVolume(volume === 0 ? 60 : 0)"
              :disabled="!device?.supports_volume"
            />
            <input
              type="range" min="0" max="100" :value="volume"
              class="w-full accent-current h-1.5 range-primary-0"
              @input="setVolume(($event.target as HTMLInputElement).valueAsNumber)"
              :disabled="!device?.supports_volume"
            />
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>
