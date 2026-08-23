<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { useLecteursWs } from '@/composables/useLecteursWs'

const { isLecteurSlideoverOpen, isQueueSlideoverOpen, activeLecteurId } = useDashboard()

/* ── WebSocket lecteurs ─────────────────────────────────────────────────── */

let ws = useLecteursWs()

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
    list.find(l => l.playing) ??
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
const volume = ref(60)

/* ── Qualité audio (track.quality : source = fichier, output = vers enceintes) ── */
const quality = computed<any>(() => (track.value as any)?.quality ?? null)
/** Libellé court pour le badge (priorité à la source du fichier) */
const qualityShort = computed(() => {
  const s = quality.value?.source
  if (!s) return null
  const khz = s.sample_rate ? `${+(s.sample_rate / 1000).toFixed(1)}k` : null
  return [String(s.codec ?? '').toUpperCase(), khz].filter(Boolean).join(' ') || 'AUDIO'
})
const fmtRate  = (hz?: number | null) => (hz ? `${+(hz / 1000).toFixed(1)} kHz` : '—')
const fmtDepth = (b?: number | null)  => (b ? `${b} bit` : '—')
const fmtBitrate = (kbps?: number | null) => (kbps ? `${kbps} kbps` : null)
const fmtChan  = (c?: number | null)  => (c ? (c === 8 ? '7.1' : c === 6 ? '5.1' : c === 2 ? 'Stéréo' : `${c} canaux`) : '—')

/* Le volume local suit le serveur (heartbeat), sauf juste après une action
   locale (drag / molette / mute) pour ne pas « lutter » avec le geste. */
const _lastLocalSet = ref(0)
watch(
  () => activeLecteur.value?.volume,
  (v) => {
    /* if (v == null || isMuted.value) return */
    if (Date.now() - _lastLocalSet.value < 800) return   // action locale récente → on garde la valeur locale
    volume.value = v
  },
  { immediate: true }
)
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
  return l ? l.playing : false
})

/* ── Position (mise à jour par Heartbeat) ───────────────────────────────── */

const positionMs = ref(0)

watch(
  () => activeLecteur.value?.temp?.position_ms,
  (ms) => { if (ms != null) positionMs.value = ms 
    /* console.log('playback override', activeLecteur.value) */
  },
  { immediate: true }
)

const toTime = (ms: number) => {
  const s  = Math.max(0, Math.floor(ms / 1000))
  const m  = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss.toString().padStart(2, '0')}`
}

/* ── Like de la piste courante (WS Lecteur.ToggleLike / GetLike) ──────────── */
const isLiked = computed(() => activeLecteur.value ? !!ws.likeById.value[activeLecteur.value.id]?.like : false)

function toggleLike() {
  if (activeLecteur.value) ws.toggleLike(activeLecteur.value.id)
}

/* ── Téléchargement de la piste courante (YouTube) ───────────────────────── */
const toast = useToast()
const canDownload = computed(() => !!track.value && isYoutube(track.value))
function downloadCurrent() {
  if (!activeLecteur.value || !track.value) return
  ws.download(activeLecteur.value.id, youtubeVideoId(track.value))
  toast.add({ title: 'Téléchargement lancé', description: track.value.title, color: 'success', icon: 'i-lucide-download' })
}

/* Demande l'état du like au changement de lecteur / de piste */
watch(
  () => [activeLecteur.value?.id, activeLecteur.value?.track?.uri ?? activeLecteur.value?.track?.title],
  () => { if (activeLecteur.value) ws.getLike(activeLecteur.value.id) },
  { immediate: true }
)

/* ── Volume (local) ─────────────────────────────────────────────────────── */


const clamp  = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n))

const _setVolumeDebounced = useDebounceFn((value: number) => {
  ws.setVolume(activeLecteur.value?.id, clamp(value))
}, 200)

function setVolume(pct: number) {
  volume.value = clamp(pct)
  _lastLocalSet.value = Date.now()   // protège la valeur locale du prochain heartbeat
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

const volumeIcon = computed((): string => {
  if (isMuted.value || volume.value === 0) return 'f7:speaker-slash-fill'
  if (volume.value < 10)                   return 'f7:speaker-fill'
  if (volume.value < 30)                   return 'f7:speaker-1-fill'
  if (volume.value < 70)                   return 'f7:speaker-2-fill'
  return                                          'f7:speaker-3-fill'
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
  _playOverride.value = !l.playing
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
onMounted(() => {
  ws = useLecteursWs()
  ws.connect()
})
</script>

<template>
  <footer class="sticky bottom-0 z-40 border-t border-default bg-elevated/80 backdrop-blur supports-[backdrop-filter]:bg-elevated/60">

    <!-- ── Desktop : 3 colonnes ─────────────────────────────────────────── -->
    <div class="hidden md:block w-full px-4">
      <div class="w-full grid grid-cols-12 items-center gap-2 p-2">

        <!-- LEFT : info piste -->
        <div class="flex items-center gap-3 min-w-0 col-span-3">
          <img :src="cover" :alt="title" class="h-16 w-16 md:h-20 md:w-20 rounded object-cover shrink-0" />
          <div class="min-w-0 flex-1">
            <MarqueeText class="text-sm font-medium" :text="title" />
            <MarqueeText class="text-xs text-dimmed" :text="artists || '—'" />
            <p v-if="activeLecteur" class="text-[11px] text-muted/70 mt-0.5">
              <span class="inline-flex items-center gap-1">
                <UIcon :name="iconForType(activeLecteur.device_type ?? activeLecteur.type)" class="w-3.5 h-3.5" />
                <span class="truncate">{{ activeLecteur.name }}</span>
                <UBadge v-if="!activeLecteur.alive" size="xs" color="error" variant="subtle">off</UBadge>
              </span>
            </p>
            <!-- Qualité audio (clic → détail source / sortie) -->
            <UPopover v-if="quality && qualityShort" mode="click">
              <UButton
                size="xs" variant="subtle" color="neutral" class="mt-1 font-mono"
                trailing-icon="i-lucide-info"
                :label="qualityShort"
                title="Qualité audio"
              />
              <template #content>
                <div class="p-3 w-64 text-xs space-y-3">
                  <div>
                    <p class="text-[10px] uppercase tracking-widest text-dimmed mb-1">Source (fichier)</p>
                    <p class="font-medium">{{ quality.source?.label || '—' }}</p>
                    <div v-if="quality.source" class="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-dimmed">
                      <span>Codec</span><span class="text-right text-default">{{ (quality.source.codec ?? '—').toUpperCase() }}</span>
                      <span>Échantillon</span><span class="text-right text-default">{{ fmtRate(quality.source.sample_rate) }}</span>
                      <template v-if="quality.source.bit_depth"><span>Profondeur</span><span class="text-right text-default">{{ fmtDepth(quality.source.bit_depth) }}</span></template>
                      <template v-if="fmtBitrate(quality.source.bitrate)"><span>Débit</span><span class="text-right text-default">{{ fmtBitrate(quality.source.bitrate) }}</span></template>
                      <span>Canaux</span><span class="text-right text-default">{{ fmtChan(quality.source.channels) }}</span>
                      <span>Lossless</span><span class="text-right text-default">{{ quality.source.lossless ? 'Oui' : 'Non' }}</span>
                    </div>
                  </div>
                  <USeparator />
                  <div>
                    <p class="text-[10px] uppercase tracking-widest text-dimmed mb-1">Sortie (enceintes)</p>
                    <p class="font-medium">{{ quality.output?.label || '—' }}</p>
                    <div v-if="quality.output" class="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-dimmed">
                      <span>Codec</span><span class="text-right text-default">{{ (quality.output.codec ?? '—').toUpperCase() }}</span>
                      <span>Échantillon</span><span class="text-right text-default">{{ fmtRate(quality.output.sample_rate) }}</span>
                      <template v-if="quality.output.bit_depth"><span>Profondeur</span><span class="text-right text-default">{{ fmtDepth(quality.output.bit_depth) }}</span></template>
                      <template v-if="fmtBitrate(quality.output.bitrate)"><span>Débit</span><span class="text-right text-default">{{ fmtBitrate(quality.output.bitrate) }}</span></template>
                      <span>Canaux</span><span class="text-right text-default">{{ fmtChan(quality.output.channels) }}</span>
                      <span>Lossless</span><span class="text-right text-default">{{ quality.output.lossless ? 'Oui' : 'Non' }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
          <UButton
            v-if="activeLecteur && track"
            :icon="isLiked ? 'mdi:heart' : 'mdi:heart-outline'"
            :color="isLiked ? 'primary' : 'neutral'"
            variant="ghost" square size="sm"
            :title="isLiked ? 'Retirer des aimés' : 'Aimer'"
            @click="toggleLike"
          />
          <UButton
            v-if="canDownload"
            icon="i-lucide-download"
            color="neutral" variant="ghost" square size="sm"
            title="Télécharger"
            @click="downloadCurrent"
          />
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
              <UIcon :name="!activeLecteur?.paused ? 'i-lucide-pause' : 'i-lucide-play'" class="w-6 h-6" />
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
          <MarqueeText class="text-sm font-medium" :text="title" />
          <MarqueeText class="text-xs text-dimmed" :text="qualityShort ? `${artists || '—'} · ${qualityShort}` : (artists || '—')" />
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
