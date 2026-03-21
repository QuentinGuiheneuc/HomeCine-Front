/* /device */

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import http from '@/src/lib/https'
import config from '@/src/config'
import { useToast, useDashboard } from '#imports'
import { useRoute, useRouter } from 'vue-router'

const { isDeviceSlideoverOpen, activeDeviceKey, DeviceAddSlideover } = useDashboard?.() ?? { isDeviceSlideoverOpen: ref(true), activeDeviceKey: ref<string | null>(null) }

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
const router = useRouter()
const q = ref('')
const typeFilter = ref<TypeFilter>('all')
const statusFilter = ref<StatusFilter>('all')

/** États audio reçus: clé = IP réellement utilisée dans `from` / `targetIp` */
const audioByKey = ref<Record<string, StateAudio>>({})

/** Master sliders */
const outPercent = ref<Record<string, number>>({})
const inPercent = ref<Record<string, number>>({})

/** Sliders par canal: par clé -> { channel: percent } */
const outChannelPercent = ref<Record<string, Record<string, number>>>({})
const inChannelPercent = ref<Record<string, Record<string, number>>>({})

/* ---------- WebSocket /controlOfDevice ---------- */

const wsStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')
const wsErrorMsg = ref<string | null>(null)

let ws: WebSocket | null = null
let wsDevice: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const wsUrl = computed(() => `${config.WS_URL}/controlOfDevice`)
// const wsUrlDevice = computed(() => `${config.WS_URL}/Device`)
/* ---------- Clé réseau ALIGNÉE avec msg.from ---------- */
function getKeyForDevice (d: Device): string {
  return (
    d.ip ||
    d.allconfig?.interfaces?.address ||
    d.allconfig?.ipres ||
    d.host ||
    ''
  )
}

/* ---------- WebSocket ---------- */

function connectWs() {
  if (typeof window === 'undefined') return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  wsStatus.value = 'connecting'
  wsErrorMsg.value = null

  try {
    ws = new WebSocket(wsUrl.value)
  } catch (err: any) {
    console.error('[WS] create error', err)
    wsStatus.value = 'disconnected'
    wsErrorMsg.value = 'Erreur création WebSocket'
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    wsStatus.value = 'connected'
    wsErrorMsg.value = null
    // Demande les états audio à tous les devices
    ws!.send(JSON.stringify({ method: 'Get.Device' }))
  }

  ws.onclose = () => {
    wsStatus.value = 'disconnected'
    scheduleReconnect()
  }

  ws.onerror = (err: any) => {
    console.error('[WS] error', err)
    wsErrorMsg.value = 'Erreur WebSocket (voir console)'
  }

  ws.onmessage = (event: MessageEvent) => {
    let msg: any
    try {
      msg = JSON.parse(event.data)
      handleWsMessage(msg)
    } catch {
      console.error('[WS] invalid JSON', event.data)
      return
    }
  }
}
// function connectWsDevice () {
//   if (typeof window === 'undefined') return
//   if (wsDevice && (wsDevice.readyState === WebSocket.OPEN || wsDevice.readyState === WebSocket.CONNECTING)) return

//   if (reconnectTimer) {
//     clearTimeout(reconnectTimer)
//     reconnectTimer = null
//   }

//   wsStatus.value = 'connecting'
//   wsErrorMsg.value = null

//   try {
//     wsDevice = new WebSocket(wsUrlDevice.value)
//   } catch (err: any) {
//     console.error('[WS] create error', err)
//     wsStatus.value = 'disconnected'
//     wsErrorMsg.value = 'Erreur création WebSocket'
//     scheduleReconnect()
//     return
//   }

//   wsDevice.onopen = () => {
//     wsStatus.value = 'connected'
//     wsErrorMsg.value = null
//     // Demande les états audio à tous les devices
//     wsDevice!.send(JSON.stringify({ method: 'Gui.RequestAllState' }))
//   }

//   wsDevice.onclose = () => {
//     wsStatus.value = 'disconnected'
//     scheduleReconnect()
//   }

//   wsDevice.onerror = (err: any) => {
//     console.error('[WS] error', err)
//     wsErrorMsg.value = 'Erreur WebSocket (voir console)'
//   }

//   wsDevice.onmessage = (event: MessageEvent) => {
//     let msg: any
//     try {
//       msg = JSON.parse(event.data)
//       const data = msg.msg || []

//       devices.value = data.map((d) => {
//         const online = d.isalive === 1
//         const cfg = d.allconfig || {}
//         const serverCfg = cfg.config?.Server || cfg.config?.server || {}
//         const vbanCfg = cfg.config?.vban || {}

//         const host =
//           d.ip ||
//           cfg.interfaces?.address ||
//           cfg.ipres ||
//           'n/a'

//         const port = Number(d.port || serverCfg.Port || serverCfg.port || 3007)

//         const hasVban = vbanCfg && Object.keys(vbanCfg).length > 0

//         const vban = hasVban
//           ? {
//               host: vbanCfg.Host ?? vbanCfg.host,
//               port: Number(vbanCfg.Port ?? vbanCfg.port ?? 0) || undefined,
//               name: vbanCfg.Name ?? vbanCfg.name,
//               channels: vbanCfg.Channels ?? vbanCfg.channels,
//               rate: vbanCfg.Rate ?? vbanCfg.rate,
//               format: vbanCfg.Format ?? vbanCfg.format
//             }
//           : undefined

//         return {
//           ...d,
//           online,
//           label: d.description || cfg.config?.con?.description || '',
//           host,
//           serverUrl: `http://${host}:${port}`,
//           vban
//         }
//       })
//     } catch {
//       console.error('[WS] invalid JSON', event.data)
//       return
//     }
//     handleWsMessage(msg)
//   }
// }
function scheduleReconnect () {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWs()
  }, 2000)
}

function handleWsMessage (msg: any) {
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
  if (msg.method === 'RES.Device' && msg.msg) {
    const data = msg.msg || []
    devices.value = data.map((d) => {
      const online = d.isalive === 1
      const cfg = d.allconfig || {}
      const serverCfg = cfg.config?.Server || cfg.config?.server || {}
      const vbanCfg = cfg.config?.vban || {}
      const host = d.ip || cfg.interfaces?.address || cfg.ipres || 'n/a'
      const port = Number(d.port || serverCfg.Port || serverCfg.port || 3007)
      const hasVban = vbanCfg && Object.keys(vbanCfg).length > 0
      const vban = hasVban ? {
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
  }
}

function sendCommand (targetKey: string, method: string, extra: Record<string, any> = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast?.add?.({
      title: 'WebSocket non connecté',
      description: 'Impossible d’envoyer la commande.',
      color: 'error'
    })
    return
  }
  ws.send(JSON.stringify({ targetIp: targetKey, method, ...extra }))
}

/* ---------- HTTP: /objet ---------- */
/* ---------- Helpers ---------- */

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

function getAudioForKey (key: string): StateAudio | null {
  if (!key) return null
  return audioByKey.value[key] || null
}

function formatMute (mute: any): string {
  if (mute === undefined || mute === null) return 'n/a'
  if (typeof mute === 'string') return mute
  return String(mute)
}

function getOutputLevel (key: string): number {
  const out = getAudioForKey(key)?.output
  if (!out || !out.volume) return 0
  const vals = Object.values(out.volume).map(Number).filter(v => !Number.isNaN(v))
  if (!vals.length) return 0
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function getInputLevel (key: string): number {
  const inp = getAudioForKey(key)?.input
  if (!inp || !inp.volume) return 0
  const vals = Object.values(inp.volume).map(Number).filter(v => !Number.isNaN(v))
  if (!vals.length) return 0
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

/* ---------- Sliders ---------- */

// Master
function handleOutputSlider (key: string, value: number) {
  outPercent.value[key] = value
  sendCommand(key, 'Set.output.volume', { percent: value })
}

function handleInputSlider (key: string, value: number) {
  inPercent.value[key] = value
  sendCommand(key, 'Set.input.volume', { percent: value })
}

// Par canal
function handleOutputChannelSlider(key: string, channel: string, value: number) {
  if (!outChannelPercent.value[key]) outChannelPercent.value[key] = {}
  outChannelPercent.value[key][channel] = value
  sendCommand(key, 'Set.output.channel', { channel, percent: value })
}

function handleInputChannelSlider (key: string, channel: string, value: number) {
  if (!inChannelPercent.value[key]) inChannelPercent.value[key] = {}
  inChannelPercent.value[key][channel] = value
  sendCommand(key, 'Set.input.channel', { channel, percent: value })
}

const openServ = (ip: string) => {
  activeDeviceKey.value = ip        // ex "192.168.1.40"
  isDeviceSlideoverOpen.value = true
}

/* ---------- Lifecycle ---------- */

onMounted(() => {
  // fetchDevices()
  connectWs()
  // connectWsDevice()
})
onBeforeUnmount(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws && ws.readyState === WebSocket.OPEN) ws.close()
})
onUnmounted(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws && ws.readyState === WebSocket.OPEN) ws.close()
})
let DeviceAddSlideoverToggle = () => {
  DeviceAddSlideover.value = !DeviceAddSlideover.value
}
</script>

<template>
  <div class="flex flex-col gap-6 pb-10 px-3 sm:px-4 lg:px-6">
    <!-- HEADER -->
    <div class="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 pt-4 pb-3" >
      <UDashboardNavbar class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default" style="height: 80px;">
        <template #left>
          <UPageCard
            title="Devices"
            description="Liste des appareils reliés au système (clients audio, serveurs, Raspberry Pi, etc.)."
            variant="naked"
            orientation="horizontal"
            class="mb-0"
          />
        </template>
        <template #right>
          <div class="flex flex-wrap gap-2 w-full lg:w-auto lg:ms-auto items-center">
            <div class="hidden sm:flex items-center gap-2 text-xs text-dimmed">
              <span>Total: {{ devices.length }}</span>
              <span>· En ligne: {{ devices.filter(d => d.online).length }}</span>
              <span>· Hors ligne: {{ devices.filter(d => !d.online).length }}</span>
            </div>

            <div class="flex items-center gap-2 text-[10px] text-dimmed">
              <span>WS:</span>
              <span
                :class="[
                  'px-2 py-0.5 rounded-full',
                  wsStatus === 'connected' && 'bg-emerald-500/10 text-emerald-400',
                  wsStatus === 'connecting' && 'bg-amber-500/10 text-amber-400',
                  wsStatus === 'disconnected' && 'bg-red-500/10 text-red-400'
                ]"
              >
                {{ wsStatus }}
              </span>
            </div>

            <!-- <UButton
              icon="i-lucide-refresh-ccw"
              color="neutral"
              :loading="loading"
              @click="fetchDevices"
            >
              Rafraîchir
            </UButton> -->
            <UButton
              icon="i-lucide-plus"
              color="primary"
              :loading="loading"
              @click="DeviceAddSlideoverToggle"
            >
              Ajouter
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </div>

    <!-- ALERTES -->
    <UAlert v-if="errorMsg" color="red" :title="errorMsg" />
    <UAlert
      v-else-if="!loading && !devices.length"
      color="neutral"
      title="Aucun device détecté."
    />
    <UAlert v-if="wsErrorMsg" color="red" :title="wsErrorMsg" />

    <!-- FILTRES -->
    <UPageCard
      variant="subtle"
      :ui="{ container: 'p-3 sm:p-4 gap-y-0', wrapper: 'items-stretch' }"
    >
      <div class="flex flex-col md:flex-row gap-3 md:items-center">
        <div class="flex-1">
          <UInput
            v-model="q"
            icon="i-lucide-search"
            placeholder="Rechercher par nom, IP, description…"
            :disabled="!devices.length"
          />
        </div>

        <div class="flex flex-wrap gap-2 items-center text-xs">
          <span class="text-dimmed">Type</span>
          <UButton
            size="2xs"
            variant="ghost"
            :color="typeFilter === 'all' ? 'primary' : 'neutral'"
            @click="typeFilter = 'all'"
          >
            Tous
          </UButton>
          <UButton
            v-for="t in ['2.0','4.2','5.1','7.1']"
            :key="t"
            size="2xs"
            variant="ghost"
            :color="typeFilter === t ? 'primary' : 'neutral'"
            @click="typeFilter = t as any"
          >
            {{ t }}
          </UButton>
        </div>

        <div class="flex flex-wrap gap-2 items-center text-xs">
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

        <div class="text-xs text-dimmed md:ms-auto">
          {{ filteredDevices.length }} device(s) affiché(s)
        </div>
      </div>
    </UPageCard>

    <!-- LISTE DES DEVICES -->
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
      <UPageCard
        v-for="d in filteredDevices"
        :key="d.id"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-3' }"
      >
        <!-- Header device -->
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-monitor-speaker" style="height: 30px; width: 30px;" />
              <UButton class="font-medium text-base" @click="router.push(`/devices/${d.id}`)" size="xs" variant="ghost" color="neutral">
                {{ d.name || 'Sans nom' }}
              </UButton>
              <UBadge
                :color="d.online ? 'primary' : 'neutral'"
                variant="subtle"
                class="text-[10px]"
              >
                {{ d.online ? 'En ligne' : 'Hors ligne' }}
              </UBadge>
            </div>
            <div class="text-xs text-dimmed">
              Type: <span class="font-mono">{{ d.type || 'n/a' }}</span>
            </div>
            <div class="text-xs text-dimmed">
              {{ d.description || d.label || 'Aucune description' }}
            </div>
          </div>

          <div class="flex flex-col items-end gap-1 text-[10px]">
            <div class="font-mono">
              {{ d.ip }}:{{ d.port }}
            </div>
            <span class="text-dimmed">ID #{{ d.id }}</span>
          </div>
        </div>

        <!-- Infos -->
        <div class="grid grid-cols-2 gap-3 text-[11px] mt-2">
          <div class="space-y-1">
            <div class="text-dimmed">VBAN</div>
            <div v-if="d.vban">
              <div class="font-mono truncate">
                {{ d.vban.host || 'host' }}:{{ d.vban.port || 'port' }}
              </div>
              <div class="font-mono">
                {{ d.vban.channels || '?' }}ch · {{ d.vban.rate || '?' }}Hz
              </div>
              <div class="font-mono">
                {{ d.vban.name || '' }} {{ d.vban.format || '' }}
              </div>
            </div>
            <div v-else class="text-dimmed">
              Non configuré
            </div>
          </div>
        </div>

        <!-- AUDIO LIVE -->
        <template v-if="getKeyForDevice(d)">
          <div
            v-if="getAudioForKey(getKeyForDevice(d))"
            class="mt-3 border-t border-default/40 pt-2 space-y-2 text-[10px]"
          >
            <div class="flex items-center justify-between">
              <span class="text-dimmed">Audio live</span>
              <span class="font-mono text-dimmed">
                {{ getAudioForKey(getKeyForDevice(d))?.pcm || '' }}
              </span>
            </div>

            <!-- OUTPUT -->
            <div v-if="getAudioForKey(getKeyForDevice(d))?.output" class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-[10px] text-dimmed">Sortie</span>
                <span
                  class="px-1.5 py-0.5 rounded border"
                  :class="[
                    /on|yes|1/i.test(
                      formatMute(getAudioForKey(getKeyForDevice(d))?.output?.mute || '')
                    )
                      ? 'border-amber-500/60 text-amber-400'
                      : 'border-default text-dimmed'
                  ]"
                >
                  Mute: {{ formatMute(getAudioForKey(getKeyForDevice(d))?.output?.mute) }}
                </span>
              </div>

              <!-- Slider master output -->
              <div class="flex flex-col gap-1 mt-1">
                <div class="flex justify-between items-center text-[9px] text-dimmed">
                  <span>Volume global</span>
                  <span class="font-mono">
                    {{
                      outPercent[getKeyForDevice(d)]
                        ?? getOutputLevel(getKeyForDevice(d))
                    }}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="
                    outPercent[getKeyForDevice(d)]
                      ?? getOutputLevel(getKeyForDevice(d))
                  "
                  class="w-full accent-current h-1.5 range-primary-0"
                  :disabled="!getAudioForKey(getKeyForDevice(d))?.output"
                  @input="handleOutputSlider(
                    getKeyForDevice(d),
                    ($event.target as HTMLInputElement).valueAsNumber
                  )"
                />
              </div>

              <!-- Sliders par canal output -->
              <div class="max-h-32 overflow-auto space-y-1 mt-2">
                <div
                  v-for="(val, ch) in getAudioForKey(getKeyForDevice(d))?.output?.volume"
                  :key="ch"
                  class="space-y-0.5"
                >
                  <div class="flex justify-between items-center gap-2">
                    <span class="text-dimmed truncate">{{ ch }}</span>
                    <span class="font-mono w-10 text-right">
                      {{
                        (outChannelPercent[getKeyForDevice(d)]
                          && outChannelPercent[getKeyForDevice(d)][ch] !== undefined)
                          ? outChannelPercent[getKeyForDevice(d)][ch]
                          : val
                      }}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    :value="
                      (outChannelPercent[getKeyForDevice(d)]
                        && outChannelPercent[getKeyForDevice(d)][ch] !== undefined)
                        ? outChannelPercent[getKeyForDevice(d)][ch]
                        : val
                    "
                    class="w-full accent-current h-1.5 range-primary-0"
                    @input="handleOutputChannelSlider(
                      getKeyForDevice(d),
                      ch,
                      ($event.target as HTMLInputElement).valueAsNumber
                    )"
                  />
                </div>
              </div>

              <!-- Boutons rapides -->
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

            <!-- INPUT -->
            <div v-if="getAudioForKey(getKeyForDevice(d))?.input" class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-[10px] text-dimmed">Entrée</span>
                <span
                  class="px-1.5 py-0.5 rounded border"
                  :class="[
                    /on|yes|1/i.test(
                      formatMute(getAudioForKey(getKeyForDevice(d))?.input?.mute || '')
                    )
                      ? 'border-amber-500/60 text-amber-400'
                      : 'border-default text-dimmed'
                  ]"
                >
                  Mute: {{ formatMute(getAudioForKey(getKeyForDevice(d))?.input?.mute) }}
                </span>
              </div>

              <!-- Slider master input -->
              <div class="flex flex-col gap-1 mt-1">
                <div class="flex justify-between items-center text-[9px] text-dimmed">
                  <span>Gain global</span>
                  <span class="font-mono">
                    {{
                      inPercent[getKeyForDevice(d)]
                        ?? getInputLevel(getKeyForDevice(d))
                    }}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  :value="
                    inPercent[getKeyForDevice(d)]
                      ?? getInputLevel(getKeyForDevice(d))
                  "
                  class="w-full accent-current h-1.5 range-primary-0"
                  :disabled="!getAudioForKey(getKeyForDevice(d))?.input"
                  @input="handleInputSlider(
                    getKeyForDevice(d),
                    ($event.target as HTMLInputElement).valueAsNumber
                  )"
                />
              </div>

              <!-- Sliders par canal input -->
              <div class="max-h-32 overflow-auto space-y-1 mt-2">
                <div
                  v-for="(val, ch) in getAudioForKey(getKeyForDevice(d))?.input?.volume"
                  :key="ch"
                  class="space-y-0.5"
                >
                  <div class="flex justify-between items-center gap-2">
                    <span class="text-dimmed truncate">{{ ch }}</span>
                    <span class="font-mono w-10 text-right">
                      {{
                        (inChannelPercent[getKeyForDevice(d)]
                          && inChannelPercent[getKeyForDevice(d)][ch] !== undefined)
                          ? inChannelPercent[getKeyForDevice(d)][ch]
                          : val
                      }}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    :value="
                      (inChannelPercent[getKeyForDevice(d)]
                        && inChannelPercent[getKeyForDevice(d)][ch] !== undefined)
                        ? inChannelPercent[getKeyForDevice(d)][ch]
                        : val
                    "
                    class="w-full accent-current h-1.5 range-primary-0"
                    @input="handleInputChannelSlider(
                      getKeyForDevice(d),
                      ch,
                      ($event.target as HTMLInputElement).valueAsNumber
                    )"
                  />
                </div>
              </div>

              <!-- Boutons rapides -->
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
        </template>

        <!-- Détails config -->
        <details class="mt-3 text-[10px] text-dimmed">
          <summary class="cursor-pointer select-none">
            Détails bruts allconfig
          </summary>
          <pre class="mt-2 max-h-56 overflow-auto bg-default/10 rounded p-2">
{{ JSON.stringify(d.allconfig, null, 2) }}
          </pre>
        </details>
      </UPageCard>
    </div>
  </div>
</template>
