<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import http from '@/src/lib/https'
import { useSpotifyPlayerWs } from '@/composables/useSpotifyPlayerWs'

const { isDevicSpotifyeSlideoverOpen } = useDashboard()

/* ===== WebSocket player ===== */
const { playerState, connect, wsStatus } = useSpotifyPlayerWs()
onMounted(connect)

/* ===== State dérivé du WS ===== */
const track    = computed(() => playerState.value?.item ?? null)
const cover    = computed(() => track.value?.album?.images?.[1]?.url || track.value?.album?.images?.[0]?.url || 'https://via.placeholder.com/96x96.png?text=♪')
const title    = computed(() => track.value?.name ?? 'No track')
const artists  = computed(() => (track.value?.artists ?? []).map(a => a.name).join(', '))
const duration = computed(() => track.value?.duration_ms ?? 0)
const device   = computed(() => playerState.value?.device ?? null)

const shuffle    = ref(false)
const repeat     = ref<'off'|'context'|'track'>('off')
const positionMs = ref(0)
const volume     = ref<number>(60)

/* Override optimiste play/pause — effacé seulement quand Spotify confirme */
const _playOverride = ref<boolean | null>(null)
let   _playOverrideTimer: ReturnType<typeof setTimeout> | null = null
const isPlaying = computed(() => _playOverride.value ?? playerState.value?.is_playing ?? false)

function _setPlayOverride(v: boolean) {
  _playOverride.value = v
  if (_playOverrideTimer) clearTimeout(_playOverrideTimer)
  // Sécurité : efface l'override au bout de 4 s si Spotify ne confirme jamais
  _playOverrideTimer = setTimeout(() => { _playOverride.value = null; _playOverrideTimer = null }, 4000)
}

/* Synchronise les champs locaux chaque fois que le WS pousse un update */
watch(playerState, (data) => {
  if (!data) return
  // Efface l'override seulement quand Spotify confirme l'état attendu
  if (_playOverride.value !== null && data.is_playing === _playOverride.value) {
    _playOverride.value = null
    if (_playOverrideTimer) { clearTimeout(_playOverrideTimer); _playOverrideTimer = null }
  }
  shuffle.value    = !!data.shuffle_state
  repeat.value     = data.repeat_state
  positionMs.value = data.progress_ms ?? 0
  volume.value     = clamp(data.device?.volume_percent ?? 0, 0, 100)
})

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

/* Le serveur envoie progress_ms interpolé toutes les 1 s → pas de tick local */

/** ===== Actions Spotify ===== */
/* État optimiste immédiat + sync WS dans les ~3 s qui suivent */

async function togglePlay() {
  if (!track.value) return
  const wasPlaying = isPlaying.value
  _setPlayOverride(!wasPlaying)               // icône bascule immédiatement
  if (wasPlaying) await http.put('/spotify/devices/pause')
  else            await http.put('/spotify/devices/play')
}
async function prev() {
  await http.post('/spotify/devices/previous')
}
async function next() {
  await http.post('/spotify/devices/next')
}
async function toggleShuffle() {
  shuffle.value = !shuffle.value      // optimiste
  await http.put('/spotify/devices/shuffle', { query: { state: String(shuffle.value) } })
}
async function cycleRepeat() {
  repeat.value = repeat.value === 'off' ? 'context' : repeat.value === 'context' ? 'track' : 'off'  // optimiste
  await http.put('/spotify/devices/repeat', { query: { state: repeat.value } })
}

const seekDebounced = useDebounceFn(async (ms: number) => {
  await http.put('/spotify/devices/seek', { query: { position_ms: ms } })
}, 250)
function onSeek(ms: number) {
  positionMs.value = Math.max(0, Math.min(ms, duration.value))  // optimiste
  seekDebounced(positionMs.value)
}

const setVolumeDebounced = useDebounceFn(async (pct: number) => {
  const d = device.value
  if (!d || !d.supports_volume) return
  await http.put('/spotify/devices/volume', { device_id: d.id, volume_percent: clamp(pct, 0, 100) })
}, 200)
function setVolume(pct: number) {
  if (!device.value?.supports_volume) return
  volume.value = clamp(pct, 0, 100)   // optimiste
  setVolumeDebounced(volume.value)
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
function iconForDeviceType(type: string) {
  const t = (type || '').toUpperCase()

  switch (t) {
    case 'AVR': return 'material-symbols:audio-video-receiver-outline'
    case 'TV': return 'material-symbols:tv-outline'
    case 'STB': return 'material-symbols:set-top-box-outline'
    case 'COMPUTER': return 'material-symbols:computer'
    case 'SMARTPHONE': return 'material-symbols:smartphone'
    case 'TABLET': return 'material-symbols:tablet-mac'
    case 'SPEAKER': return 'material-symbols:speaker'
    case 'GAMECONSOLE': return 'material-symbols:sports-esports'
    case 'CASTAUDIO': return 'material-symbols:cast-audio'
    case 'CASTVIDEO': return 'material-symbols:cast-connected'
    case 'AUTOMOBILE': return 'material-symbols:directions-car'
    case 'SMARTWATCH': return 'material-symbols:watch'
    case 'CHROMEBOOK': return 'material-symbols:laptop-chromebook'
    case 'CARTHING': return 'material-symbols:smart-display-outline'
    case 'AUDIODONGLE': return 'material-symbols:usb'
    default: return 'i-lucide-monitor-speaker'
  }
}
</script>

<template>
  <footer class="sticky bottom-0 z-40 border-t border-default bg-elevated/80 backdrop-blur supports-[backdrop-filter]:bg-elevated/60">
    <div class="w-full px-4">
      <div class="w-full grid grid-cols-1 md:grid-cols-12 items-center gap-2 p-2">
        <!-- LEFT -->
        <div class="flex items-center gap-3 min-w-0 md:col-span-4 xl:col-span-3">
          <img :src="cover" :alt="title" class="h-16 w-16 md:h-20 md:w-20 rounded object-cover" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ title }}</p>
            <p class="truncate text-xs text-dimmed">{{ artists || '—' }}</p>
            <p v-if="device" class="text-[11px] text-muted/70">
              <span class="inline-flex items-center gap-1">
                <UIcon :name="iconForDeviceType(device.type || '')" class="w-4 h-4" />
                <span class="truncate">
                  {{ device.name }} {{ device.is_private_session ? '🔒' : '' }}
                </span>
              </span>
            </p>
          </div>
          <UButton icon="i-lucide-heart" variant="ghost" color="neutral" square />
        </div>

        <!-- CENTER -->
        <div class="md:col-span-6 xl:col-span-5 flex flex-col items-center gap-3">
          <div class="flex items-center gap-4">
            <UButton :color="shuffle ? 'primary' : 'neutral'" variant="ghost" icon="i-lucide-shuffle" size="sm" square @click="toggleShuffle" />
            <UButton variant="ghost" color="neutral" icon="i-lucide-skip-back" size="sm" square @click="prev" />
            <UButton size="xl" square class="rounded-full h-12 w-12 justify-center items-center" @click="togglePlay">
              <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="w-6 h-6" />
            </UButton>
            <UButton variant="ghost" color="neutral" icon="i-lucide-skip-forward" size="sm" square @click="next" />
            <UButton :color="repeat !== 'off' ? 'primary' : 'neutral'" variant="ghost" :icon="repeat === 'track' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'" size="sm" square @click="cycleRepeat" />
          </div>

          <div class="flex items-center gap-3 w-full max-w-6xl">
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
        <div class="md:col-span-3 xl:col-span-4 flex items-center justify-end gap-2">
          <UButton variant="ghost" color="neutral" icon="material-symbols:event-list-sharp" style="rotate: 180deg;" size="lg" square />
          <UButton variant="ghost" color="neutral" icon="i-lucide-list-music" size="lg" square />
          <UButton variant="ghost" :color="device?.type ? 'primary' : 'neutral'" :icon="iconForDeviceType(device?.type || 'i-lucide-monitor-speaker')" size="lg" square @click="isDevicSpotifyeSlideoverOpen = true" />
          <div class="flex items-center gap-2 w-40 max-w-[12rem]" @wheel.prevent="onWheelMaster">
            <UButton
              variant="ghost" color="neutral"
              :icon="volume === 0 ? 'i-lucide-volume-x' : volume < 50 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'" size="lg"
              square
              @click="setVolume(volume === 0 ? 60 : 0)"
              :disabled="!device?.supports_volume"
            />
            <input
              type="range" min="0" max="100" :value="volume"
              class="w-full accent-current h-2 range-primary-0"
              style="width: 131px; height: 12px;"
              @input="setVolume(($event.target as HTMLInputElement).valueAsNumber)"
              :disabled="!device?.supports_volume"
            />
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>
