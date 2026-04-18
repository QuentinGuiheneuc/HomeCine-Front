<!-- DeviceSlideover.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import http from '@/src/lib/https'
import { useToast, useDebounceFn, useDashboard } from '#imports'

/* ---------- Dashboard / Slideover ---------- */
const { isDeviceSlideoverOpen, activeDeviceKey } = useDashboard()

/* ---------- Types ---------- */
type RawDevice = {
  id: number
  name: string
  ip: string
  port: string
  description: string
  type: string
  isalive: number
  allconfig: any | null
}

type Device = RawDevice & {
  online: boolean
  label: string
  host: string
  serverUrl: string
  vban?: {
    host?: string
    port?: number
    name?: string
    channels?: number
    rate?: number
    format?: string
  }
}

type StateAudio = {
  card: number
  pcm: string
  id?: string
  device?: number
  output?: {
    volume: Record<string, number>
    mute: any
  } | null
  input?: {
    volume: Record<string, number>
    mute: any
  } | null
}

type TypeFilter = 'all' | '2.0' | '4.2' | '5.1' | '7.1'
type StatusFilter = 'all' | 'online' | 'offline'

/* ---------- State ---------- */
const devices = ref<Device[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const toast = useToast?.()

const q = ref('')
const typeFilter = ref<TypeFilter>('all')
const statusFilter = ref<StatusFilter>('all')

/** États audio: clé = IP utilisée dans `from` / `targetIp` */
const audioByKey = ref<Record<string, StateAudio>>({})

/** Sliders master */
const outPercent = ref<Record<string, number>>({})
const inPercent = ref<Record<string, number>>({})

/** Sliders par canal */
const outChannelPercent = ref<Record<string, Record<string, number>>>({})
const inChannelPercent = ref<Record<string, Record<string, number>>>({})

/** Réfs DOM des lignes (key -> element) */
const deviceRows = ref<Record<string, HTMLElement | null>>({})

function setDeviceRowRef (key: string, el: HTMLElement | null) {
  if (!key) return
  if (!deviceRows.value) deviceRows.value = {}
  deviceRows.value[key] = el
}
function getDeviceRow (key: string): HTMLElement | null {
  return deviceRows.value?.[key] ?? null
}

/* ---------- WebSocket /controlOfDevice ---------- */
const { status: wsStatus, send: wsSend, on: wsOn } = useDeviceControlWs()

// Envoie Gui.RequestAllState dès la connexion établie
watch(wsStatus, (s) => {
  if (s === 'connected') wsSend('Gui.RequestAllState')
})

const offWs = wsOn(handleWsMessage)

/* ---------- Utils ---------- */
function getKeyForDevice(d: Device): string {
  return (
    d.ip ||
    d.allconfig?.interfaces?.address ||
    d.allconfig?.ipres ||
    d.host ||
    ''
  )
}

/* ---------- Message handler ---------- */
function handleWsMessage(msg: any) {
  if (msg.method === 'State.audio' && msg.from && msg.data) {
    const key = String(msg.from)
    audioByKey.value = {
      ...audioByKey.value,
      [key]: msg.data as StateAudio
    }
    return
  }
  if (msg.method === 'Error') {
    console.warn('[WS] Device error:', msg)
    toast?.add?.({
      title: 'Erreur device',
      description: msg.error || 'Erreur inconnue',
      color: 'error'
    })
  }
}

function sendCommand(targetKey: string, method: string, extra: Record<string, any> = {}) {
  const sent = wsSend(method, { targetIp: targetKey, ...extra })
  if (!sent) {
    toast?.add?.({
      title: 'WebSocket non connecté',
      description: "Impossible d'envoyer la commande.",
      color: 'error'
    })
  }
}

/* ---------- HTTP: /objet ---------- */
async function fetchDevices() {
  try {
    loading.value = true
    errorMsg.value = null

    const res = await http.get<RawDevice[]>('/objet')
    const data = res.data || []

    devices.value = data.map((d) => {
      const online = d.isalive === 1
      const cfg = d.allconfig || {}
      const serverCfg = cfg.config?.Server || cfg.config?.server || {}
      const vbanCfg = cfg.config?.vban || {}

      const host =
        d.ip ||
        cfg.interfaces?.address ||
        cfg.ipres ||
        'n/a'

      const port = Number(d.port || serverCfg.Port || serverCfg.port || 3007)

      const hasVban = vbanCfg && Object.keys(vbanCfg).length > 0

      const vban = hasVban
        ? {
            host: vbanCfg.Host ?? vbanCfg.host,
            port: Number(vbanCfg.Port ?? vbanCfg.port ?? 0) || undefined,
            name: vbanCfg.Name ?? vbanCfg.name,
            channels: vbanCfg.Channels ?? vbanCfg.channels,
            rate: vbanCfg.Rate ?? vbanCfg.rate,
            format: vbanCfg.Format ?? vbanCfg.format
          }
        : undefined

      return {
        ...d,
        online,
        label: d.description || cfg.config?.con?.description || '',
        host,
        serverUrl: `http://${host}:${port}`,
        vban
      }
    })
  } catch (e: any) {
    console.error('[devices] fetch error', e)
    errorMsg.value = 'Impossible de charger la liste des devices.'
    toast?.add?.({ title: 'Erreur chargement devices', color: 'error' })
  } finally {
    loading.value = false
  }
}

/* ---------- Helpers UI ---------- */
const filteredDevices = computed(() => {
  let list = [...devices.value]

  if (typeFilter.value !== 'all') {
    list = list.filter(d => d.type === typeFilter.value)
  }

  if (statusFilter.value !== 'all') {
    const wantOnline = statusFilter.value === 'online'
    list = list.filter(d => d.online === wantOnline)
  }

  if (q.value.trim()) {
    const rex = new RegExp(q.value.trim(), 'i')
    list = list.filter(d =>
      rex.test(d.name) ||
      rex.test(d.ip) ||
      rex.test(d.description || '') ||
      rex.test(String(d.type)) ||
      rex.test(d.allconfig?.config?.con?.name || '')
    )
  }

  return list
})

function getAudioForKey(key: string): StateAudio | null {
  if (!key) return null
  return audioByKey.value[key] || null
}

function formatMute(mute: any): string {
  if (mute === undefined || mute === null) return 'n/a'
  if (typeof mute === 'string') return mute
  return String(mute)
}

function getOutputLevel(key: string): number {
  const out = getAudioForKey(key)?.output
  if (!out || !out.volume) return 0
  const vals = Object.values(out.volume).map(Number).filter(v => !Number.isNaN(v))
  if (!vals.length) return 0
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function getInputLevel(key: string): number {
  const inp = getAudioForKey(key)?.input
  if (!inp || !inp.volume) return 0
  const vals = Object.values(inp.volume).map(Number).filter(v => !Number.isNaN(v))
  if (!vals.length) return 0
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

/* ---------- Sliders (avec debounce master) ---------- */
const setVolumeDebounced = useDebounceFn?.(async (key: string, kind: 'output' | 'input', pct: number) => {
  if (kind === 'output') {
    sendCommand(key, 'Set.output.volume', { percent: pct })
  } else {
    sendCommand(key, 'Set.input.volume', { percent: pct })
  }
}, 120) ?? ((key: string, kind: 'output' | 'input', pct: number) => {
  if (kind === 'output') sendCommand(key, 'Set.output.volume', { percent: pct })
  else sendCommand(key, 'Set.input.volume', { percent: pct })
})

function handleOutputSlider(key: string, value: number) {
  outPercent.value[key] = value
  setVolumeDebounced(key, 'output', value)
}

function handleInputSlider(key: string, value: number) {
  inPercent.value[key] = value
  setVolumeDebounced(key, 'input', value)
}

// Par canal
function handleOutputChannelSlider(key: string, channel: string, value: number) {
  if (!outChannelPercent.value[key]) outChannelPercent.value[key] = {}
  outChannelPercent.value[key][channel] = value
  sendCommand(key, 'Set.output.channel', { channel, percent: value })
}

function handleInputChannelSlider(key: string, channel: string, value: number) {
  if (!inChannelPercent.value[key]) inChannelPercent.value[key] = {}
  inChannelPercent.value[key][channel] = value
  sendCommand(key, 'Set.input.channel', { channel, percent: value })
}

/* ---------- Scroll + highlight ---------- */
function scrollAndHighlight(key: string) {
  if (!key) return
  const el = getDeviceRow(key)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  setTimeout(() => {
    el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2')
  }, 1500)
}

/* ---------- Lifecycle ---------- */
onMounted(() => {
  fetchDevices()
  // useDeviceControlWs gère la connexion WS automatiquement
})

onUnmounted(() => {
  offWs()
})

/* Quand le slideover s'ouvre, on synchronise la liste et on scrolle vers la clé active */
watch(isDeviceSlideoverOpen, async (open) => {
  if (!open) return
  await fetchDevices()
  // Demander un refresh d'état si déjà connecté
  if (wsStatus.value === 'connected') wsSend('Gui.RequestAllState')

  const key = activeDeviceKey.value ? String(activeDeviceKey.value) : ''
  if (key) q.value = key

  await nextTick()
  if (key) scrollAndHighlight(key)
})

/* Si la clé active change pendant que le panneau est ouvert */
watch(activeDeviceKey, async (key) => {
  if (!key) return
  if (!isDeviceSlideoverOpen.value) isDeviceSlideoverOpen.value = true
  q.value = key
  await nextTick()
  scrollAndHighlight(key)
})
</script>

<template>
  <USlideover
    v-model:open="isDeviceSlideoverOpen"
    title="Devices"
    :ui="{ content: 'max-w-6xl w-screen', header: 'px-4 py-4', body: 'px-0 py-0' }"
  >
    <template #header>
      <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-default">
        <div>
          <div class="font-medium text-sm">Devices audio</div>
          <div class="text-[11px] text-dimmed">
            {{ devices.length }} device(s) · WS:
            <span
              :class="[
                'px-2 py-0.5 rounded-full text-[10px]',
                wsStatus === 'connected' && 'bg-emerald-500/10 text-emerald-400',
                wsStatus === 'connecting' && 'bg-amber-500/10 text-amber-400',
                wsStatus === 'disconnected' && 'bg-red-500/10 text-red-400'
              ]"
            >
              {{ wsStatus }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UInput
            v-model="q"
            icon="i-lucide-search"
            placeholder="Rechercher par nom, IP, description…"
            size="xs"
            class="w-52"
          />
          <UButton
            icon="i-lucide-refresh-ccw"
            size="xs"
            color="neutral"
            :loading="loading"
            @click="fetchDevices"
          >
            Refresh
          </UButton>
        </div>
      </div>
    </template>

    <template #body>
      <div class="px-4 py-2 flex flex-wrap gap-3 items-center text-[10px] border-b border-default/60">
        <div class="flex items-center gap-1">
          <span class="text-dimmed">Type</span>
          <UButton
            v-for="t in ['all','2.0','4.2','5.1','7.1']"
            :key="t"
            size="2xs"
            variant="ghost"
            :color="typeFilter === t ? 'primary' : 'neutral'"
            @click="typeFilter = t as TypeFilter"
          >
            {{ t === 'all' ? 'Tous' : t }}
          </UButton>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-dimmed">Statut</span>
          <UButton
            size="2xs"
            variant="ghost"
            :color="statusFilter === 'all' ? 'primary' : 'neutral'"
            @click="statusFilter = 'all'"
          >
            Tous
          </UButton>
          <UButton
            size="2xs"
            variant="ghost"
            :color="statusFilter === 'online' ? 'primary' : 'neutral'"
            @click="statusFilter = 'online'"
          >
            En ligne
          </UButton>
          <UButton
            size="2xs"
            variant="ghost"
            :color="statusFilter === 'offline' ? 'primary' : 'neutral'"
            @click="statusFilter = 'offline'"
          >
            Hors ligne
          </UButton>
        </div>
        <div class="ms-auto text-[10px] text-dimmed">
          {{ filteredDevices.length }} device(s) affiché(s)
        </div>
      </div>

      <div class="p-3 space-y-2">
        <UAlert v-if="errorMsg" color="red" :title="errorMsg" />
        <UAlert
          v-else-if="!loading && !filteredDevices.length"
          color="neutral"
          title="Aucun device détecté."
        />

        <div
          v-for="d in filteredDevices"
          :key="d.id"
          :data-key="getKeyForDevice(d)"
          :ref="el => setDeviceRowRef(getKeyForDevice(d), el as HTMLElement | null)"
          class="px-3 py-3 rounded-xl border border-default/60 bg-background/60 hover:bg-elevated/40 transition flex flex-col gap-2"
        >
          <!-- Entête -->
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-monitor-speaker" class="w-5 h-5" />
                <span class="font-medium text-sm">
                  {{ d.name || 'Sans nom' }}
                </span>
                <UBadge
                  :color="d.online ? 'primary' : 'neutral'"
                  variant="subtle"
                  class="text-[9px]"
                >
                  {{ d.online ? 'En ligne' : 'Hors ligne' }}
                </UBadge>
                <!-- Bouton qui ouvre sur la bonne clé -->
                <UButton
                  size="2xs"
                  variant="ghost"
                  color="neutral"
                  @click="() => {
                    const key = getKeyForDevice(d) || ''
                    if (!key) return
                    activeDeviceKey.value = key
                    isDeviceSlideoverOpen.value = true
                    q.value = key
                    nextTick().then(() => scrollAndHighlight(key))
                  }"
                >
                  Ouvrir
                </UButton>
              </div>
              <div class="text-[10px] text-dimmed">
                {{ d.description || d.label || 'Aucune description' }}
              </div>
              <div class="text-[9px] text-dimmed font-mono">
                {{ d.ip }}:{{ d.port }} · {{ d.type || 'n/a' }}
              </div>
            </div>

            <div class="text-[9px] text-right text-dimmed space-y-0.5">
              <div class="font-mono truncate max-w-[160px]">
                {{ d.serverUrl }}
              </div>
              <div v-if="d.vban" class="font-mono">
                VBAN: {{ d.vban.host }}:{{ d.vban.port }} ·
                {{ d.vban.channels }}ch {{ d.vban.rate }}Hz
              </div>
            </div>
          </div>

          <!-- Audio -->
          <div
            v-if="getKeyForDevice(d) && getAudioForKey(getKeyForDevice(d))"
            class="mt-1 pt-2 border-t border-default/40 space-y-2"
          >
            <div class="flex justify-between text-[9px] text-dimmed">
              <span>Audio</span>
              <span class="font-mono">
                {{ getAudioForKey(getKeyForDevice(d))?.pcm || '' }}
              </span>
            </div>

            <!-- SORTIE -->
            <div v-if="getAudioForKey(getKeyForDevice(d))?.output" class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-semibold text-dimmed">Sortie</span>
                <span
                  class="px-1.5 py-0.5 rounded border text-[8px]"
                  :class="[
                    /on|yes|1/i.test(formatMute(getAudioForKey(getKeyForDevice(d))?.output?.mute || ''))
                      ? 'border-amber-500/60 text-amber-400'
                      : 'border-default text-dimmed'
                  ]"
                >
                  Mute: {{ formatMute(getAudioForKey(getKeyForDevice(d))?.output?.mute) }}
                </span>
              </div>

              <!-- Slider global sortie -->
              <div class="flex items-center gap-2">
                <UIcon
                  :name="(outPercent[getKeyForDevice(d)] ?? getOutputLevel(getKeyForDevice(d))) === 0
                    ? 'i-lucide-volume-x'
                    : (outPercent[getKeyForDevice(d)] ?? getOutputLevel(getKeyForDevice(d))) < 50
                      ? 'i-lucide-volume-1'
                      : 'i-lucide-volume-2'"
                  class="w-3 h-3 text-dimmed"
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="outPercent[getKeyForDevice(d)] ?? getOutputLevel(getKeyForDevice(d))"
                  class="w-full accent-current h-1.5 range-primary-0"
                  @input="handleOutputSlider(
                    getKeyForDevice(d),
                    ($event.target as HTMLInputElement).valueAsNumber
                  )"
                />
                <span class="w-8 text-right text-[9px] font-mono">
                  {{ outPercent[getKeyForDevice(d)] ?? getOutputLevel(getKeyForDevice(d)) }}%
                </span>
              </div>

              <!-- Sliders par canal sortie -->
              <div class="grid grid-cols-2 gap-1 mt-1 text-[8px]">
                <div
                  v-for="(val, ch) in getAudioForKey(getKeyForDevice(d))?.output?.volume"
                  :key="ch"
                  class="flex flex-col gap-0.5"
                >
                  <div class="flex justify-between gap-1">
                    <span class="text-dimmed truncate">{{ ch }}</span>
                    <span class="font-mono">{{ val }}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    :value="outChannelPercent[getKeyForDevice(d)]?.[ch] ?? Number(val)"
                    class="w-full accent-current h-1 range-primary-0"
                    @input="handleOutputChannelSlider(
                      getKeyForDevice(d),
                      ch,
                      ($event.target as HTMLInputElement).valueAsNumber
                    )"
                  />
                </div>
              </div>

              <!-- Actions rapides sortie -->
              <div class="flex flex-wrap gap-1 mt-1">
                <UButton
                  size="2xs"
                  variant="ghost"
                  @click="sendCommand(getKeyForDevice(d), 'Bump.output.volume', { delta: 5 })"
                >
                  +5%
                </UButton>
                <UButton
                  size="2xs"
                  variant="ghost"
                  @click="sendCommand(getKeyForDevice(d), 'Bump.output.volume', { delta: -5 })"
                >
                  -5%
                </UButton>
                <UButton
                  size="2xs"
                  color="red"
                  variant="ghost"
                  @click="sendCommand(getKeyForDevice(d), 'Toggle.output.mute')"
                >
                  Mute
                </UButton>
              </div>
            </div>

            <!-- ENTREE -->
            <div v-if="getAudioForKey(getKeyForDevice(d))?.input" class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-semibold text-dimmed">Entrée</span>
                <span
                  class="px-1.5 py-0.5 rounded border text-[8px]"
                  :class="[
                    /on|yes|1/i.test(formatMute(getAudioForKey(getKeyForDevice(d))?.input?.mute || ''))
                      ? 'border-amber-500/60 text-amber-400'
                      : 'border-default text-dimmed'
                  ]"
                >
                  Mute: {{ formatMute(getAudioForKey(getKeyForDevice(d))?.input?.mute) }}
                </span>
              </div>

              <!-- Slider global entrée -->
              <div class="flex items-center gap-2">
                <UIcon
                  :name="(inPercent[getKeyForDevice(d)] ?? getInputLevel(getKeyForDevice(d))) === 0
                    ? 'i-lucide-volume-x'
                    : (inPercent[getKeyForDevice(d)] ?? getInputLevel(getKeyForDevice(d))) < 50
                      ? 'i-lucide-volume-1'
                      : 'i-lucide-volume-2'"
                  class="w-3 h-3 text-dimmed"
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="inPercent[getKeyForDevice(d)] ?? getInputLevel(getKeyForDevice(d))"
                  class="w-full accent-current h-1.5 range-primary-0"
                  @input="handleInputSlider(
                    getKeyForDevice(d),
                    ($event.target as HTMLInputElement).valueAsNumber
                  )"
                />
                <span class="w-8 text-right text-[9px] font-mono">
                  {{ inPercent[getKeyForDevice(d)] ?? getInputLevel(getKeyForDevice(d)) }}%
                </span>
              </div>

              <!-- Sliders par canal entrée -->
              <div class="grid grid-cols-2 gap-1 mt-1 text-[8px]">
                <div
                  v-for="(val, ch) in getAudioForKey(getKeyForDevice(d))?.input?.volume"
                  :key="ch"
                  class="flex flex-col gap-0.5"
                >
                  <div class="flex justify-between gap-1">
                    <span class="text-dimmed truncate">{{ ch }}</span>
                    <span class="font-mono">{{ val }}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    :value="inChannelPercent[getKeyForDevice(d)]?.[ch] ?? Number(val)"
                    class="w-full accent-current h-1 range-primary-0"
                    @input="handleInputChannelSlider(
                      getKeyForDevice(d),
                      ch,
                      ($event.target as HTMLInputElement).valueAsNumber
                    )"
                  />
                </div>
              </div>

              <!-- Actions rapides entrée -->
              <div class="flex flex-wrap gap-1 mt-1">
                <UButton
                  size="2xs"
                  variant="ghost"
                  @click="sendCommand(getKeyForDevice(d), 'Bump.input.volume', { delta: 5 })"
                >
                  +5%
                </UButton>
                <UButton
                  size="2xs"
                  variant="ghost"
                  @click="sendCommand(getKeyForDevice(d), 'Bump.input.volume', { delta: -5 })"
                >
                  -5%
                </UButton>
                <UButton
                  size="2xs"
                  color="red"
                  variant="ghost"
                  @click="sendCommand(getKeyForDevice(d), 'Toggle.input.mute')"
                >
                  Mute
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
