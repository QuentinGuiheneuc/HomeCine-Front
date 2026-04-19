<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useToast, useDashboard } from '#imports'
import { useRouter } from 'vue-router'

const { isDeviceSlideoverOpen, activeDeviceKey, DeviceAddSlideover } = useDashboard?.() ?? {
  isDeviceSlideoverOpen: ref(false),
  activeDeviceKey: ref<string | null>(null),
  DeviceAddSlideover: ref(false),
}
const toast  = useToast?.()
const router = useRouter()

/* ─── Types ──────────────────────────────────────────────────────────────── */

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
  output?: { volume: Record<string, number>; mute: any } | null
  input?:  { volume: Record<string, number>; mute: any } | null
}

type TypeFilter   = 'all' | '2.0' | '4.2' | '5.1' | '7.1'
type StatusFilter = 'all' | 'online' | 'offline'

/* ─── State ──────────────────────────────────────────────────────────────── */

const devices       = ref<Device[]>([])
const q             = ref('')
const typeFilter    = ref<TypeFilter>('all')
const statusFilter  = ref<StatusFilter>('all')

/** États audio reçus par IP (clé = msg.from) */
const audioByKey = ref<Record<string, StateAudio>>({})

/** Valeurs des sliders master (overrides les valeurs serveur pendant le drag) */
const outPercent        = ref<Record<string, number>>({})
const inPercent         = ref<Record<string, number>>({})
const outChannelPercent = ref<Record<string, Record<string, number>>>({})
const inChannelPercent  = ref<Record<string, Record<string, number>>>({})

/* ─── WebSocket ──────────────────────────────────────────────────────────── */

const { status: wsStatus, send: wsSend, on: wsOn } = useDeviceControlWs()

watch(wsStatus, s => { if (s === 'connected'){ 
  wsSend('Get.Device')
  wsSend('Get.audio')
} })

const offWs = wsOn((msg: any) => {
  console.log("send ws", msg)
  if (msg?.msg?.method === 'State.audio' && msg.from && msg.msg?.State?.audio) {
    audioByKey.value = { ...audioByKey.value, [String(msg.from)]: msg.msg.State.audio as StateAudio }
    return
  }
  if (msg.method === 'RES.Device' && msg.msg) {
    devices.value = (msg.msg as RawDevice[]).map(normaliseDevice)
    return
  }
  if (msg.method === 'Error') {
    toast?.add?.({ title: 'Erreur device', description: msg.error || 'Erreur inconnue', color: 'error' })
  }
})

/* ─── Normalisation ──────────────────────────────────────────────────────── */

function normaliseDevice(d: RawDevice): Device {
  const online    = Number(d.isalive) === 1
  const cfg       = d.allconfig || {}
  const serverCfg = cfg.config?.Server || cfg.config?.server || {}
  const vbanCfg   = cfg.config?.vban || {}
  const host      = d.ip || cfg.interfaces?.address || cfg.ipres || 'n/a'
  const port      = Number(d.port || serverCfg.Port || serverCfg.port || 3007)
  const hasVban   = vbanCfg && Object.keys(vbanCfg).length > 0

  return {
    ...d,
    online,
    label: d.description || cfg.config?.con?.description || '',
    host,
    serverUrl: `http://${host}:${port}`,
    vban: hasVban ? {
      host:     vbanCfg.Host     ?? vbanCfg.host,
      port:     Number(vbanCfg.Port ?? vbanCfg.port ?? 0) || undefined,
      name:     vbanCfg.Name     ?? vbanCfg.name,
      channels: vbanCfg.Channels ?? vbanCfg.channels,
      rate:     vbanCfg.Rate     ?? vbanCfg.rate,
      format:   vbanCfg.Format   ?? vbanCfg.format,
    } : undefined,
  }
}

function deviceKey(d: Device): string {
  return d.ip || d.allconfig?.interfaces?.address || d.allconfig?.ipres || d.host || ''
}

/* ─── Computed liste enrichie ────────────────────────────────────────────── */

/** Liste filtrée + clé réseau + données audio pré-résolues */
const rows = computed(() => {
  let list = devices.value.slice()

  if (typeFilter.value   !== 'all') list = list.filter(d => d.type === typeFilter.value)
  if (statusFilter.value !== 'all') {
    const wantOnline = statusFilter.value === 'online'
    list = list.filter(d => d.online === wantOnline)
  }
  if (q.value.trim()) {
    const rex = new RegExp(q.value.trim(), 'i')
    list = list.filter(d =>
      rex.test(d.name) || rex.test(d.ip) ||
      rex.test(d.description || '') || rex.test(d.type) ||
      rex.test(d.allconfig?.config?.con?.name || '')
    )
  }

  return list.map(d => {
    const key   = deviceKey(d)
    const audio = audioByKey.value[key] ?? null
    const outVals = audio?.output?.volume ? Object.values(audio.output.volume).map(Number).filter(v => !isNaN(v)) : []
    const inVals  = audio?.input?.volume  ? Object.values(audio.input.volume) .map(Number).filter(v => !isNaN(v)) : []
    return {
      ...d,
      key,
      audio,
      outLevel: outVals.length ? Math.round(outVals.reduce((a, b) => a + b) / outVals.length) : 0,
      inLevel:  inVals.length  ? Math.round(inVals.reduce( (a, b) => a + b) / inVals.length)  : 0,
    }
  })
})

const onlineCount  = computed(() => devices.value.filter(d =>  d.online).length)
const offlineCount = computed(() => devices.value.filter(d => !d.online).length)

/* ─── Commandes WS ───────────────────────────────────────────────────────── */

function send(key: string, method: string, extra: Record<string, any> = {}) {
  console.log(method, { targetIp: key, ...extra })
  const ok = wsSend(method, { targetIp: key, ...extra })
  if (!ok) toast?.add?.({ title: 'WS non connecté', color: 'error' })
}


/* ─── Helpers affichage sliders ─────────────────────────────────────────── */

/** Valeur affichée pour la sortie : override local si en cours de drag, sinon valeur serveur */
function outVal(key: string, fallback: number): number {
  return key in outPercent.value ? outPercent.value[key] : fallback
}
function inVal(key: string, fallback: number): number {
  return key in inPercent.value ? inPercent.value[key] : fallback
}
function outChVal(key: string, ch: string, fallback: number): number {
  return outChannelPercent.value[key]?.[ch] ?? fallback
}
function inChVal(key: string, ch: string, fallback: number): number {
  return inChannelPercent.value[key]?.[ch] ?? fallback
}

/* ─── Sliders ────────────────────────────────────────────────────────────── */

function onOutSlider(key: string, v: number) {
  outPercent.value = { ...outPercent.value, [key]: v }
  // Vider les overrides de canaux : le serveur va tout remettre au même niveau
  const ch = { ...outChannelPercent.value }
  delete ch[key]
  outChannelPercent.value = ch
  send(key, 'Set.output.volume', { percent: v })
}
function onInSlider(key: string, v: number) {
  inPercent.value = { ...inPercent.value, [key]: v }
  const ch = { ...inChannelPercent.value }
  delete ch[key]
  inChannelPercent.value = ch
  send(key, 'Set.input.volume', { percent: v })
}
function onOutChannelSlider(key: string, ch: string, v: number) {
  outChannelPercent.value = {
    ...outChannelPercent.value,
    [key]: { ...(outChannelPercent.value[key] ?? {}), [ch]: v }
  }
  send(key, 'Set.output.channel', { channel: ch, percent: v })
}
function onInChannelSlider(key: string, ch: string, v: number) {
  inChannelPercent.value = {
    ...inChannelPercent.value,
    [key]: { ...(inChannelPercent.value[key] ?? {}), [ch]: v }
  }
  send(key, 'Set.input.channel', { channel: ch, percent: v })
}

function muteLabel(mute: any): string {
  if (mute == null) return 'n/a'
  return String(mute)
}
function isMuted(mute: any): boolean {
  return /on|yes|1|true/i.test(String(mute ?? ''))
}

/* ─── Navigation ─────────────────────────────────────────────────────────── */

function openSlideover(key: string) {
  activeDeviceKey.value = key
  isDeviceSlideoverOpen.value = true
}

/* ─── Polling devices ────────────────────────────────────────────────────── */

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollTimerAudio: ReturnType<typeof setInterval> | null = null

function requestData() {
  wsSend('Get.Device')
  wsSend('Get.audio')
}

onMounted(() => {
  // Si le WS singleton est déjà connecté, le watch ne se déclenche pas → envoi immédiat
  if (wsStatus.value === 'connected') requestData()
  pollTimer      = setInterval(() => wsSend('Get.Device'), 5_000)
  pollTimerAudio = setInterval(() => wsSend('Get.audio'),  10_000)
})
onUnmounted(() => {
  if (pollTimer)      clearInterval(pollTimer)
  if (pollTimerAudio) clearInterval(pollTimerAudio)
  offWs()
})

function refresh() {
  requestData()
}

</script>

<template>
  <div class="flex flex-col min-h-0 flex-1">

    <!-- ── HEADER ──────────────────────────────────────────────────────────── -->
    <UDashboardNavbar class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default" style="height: 120px;">
      <template #leading>
        <UPageCard
          title="Devices"
          :description="`Total: ${devices.length} · En ligne: ${onlineCount} · Hors ligne: ${offlineCount}`"
          variant="naked"
          orientation="horizontal"
          :ui="{ container: 'p-4 sm:p-4 gap-3' }"
          class="mb-0 flex items-center"
        />
      </template>

      <template #right>
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 text-[11px]">
            <span
              class="size-2 rounded-full"
              :class="{
                'bg-emerald-400': wsStatus === 'connected',
                'bg-amber-400 animate-pulse': wsStatus === 'connecting',
                'bg-red-400': wsStatus === 'error' || wsStatus === 'disconnected',
                'bg-muted': wsStatus === 'idle',
              }"
            />
            <span class="text-dimmed hidden sm:inline">{{ wsStatus }}</span>
          </div>
          <UButton icon="i-lucide-refresh-ccw" color="neutral" @click="refresh">Rafraichir</UButton>
          <UButton icon="i-lucide-plus" color="primary" @click="DeviceAddSlideover = !DeviceAddSlideover">Ajouter</UButton>
        </div>
      </template>
    </UDashboardNavbar>

    <main class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8">
      <div class="w-full lg:max-w-12xl py-6 sm:py-8 lg:py-10 space-y-4">

        <!-- ── FILTRES ──────────────────────────────────────────────────────── -->
        <UPageCard variant="subtle" :ui="{ container: 'p-3' }">
          <div class="flex flex-col md:flex-row gap-3 md:items-center">
            <UInput
              v-model="q"
              icon="i-lucide-search"
              placeholder="Rechercher par nom, IP, type…"
              class="flex-1"
              :disabled="!devices.length"
            />
            <div class="flex gap-2 items-center text-xs">
              <span class="text-dimmed">Type</span>
              <UButton
                v-for="t in ['all', '2.0', '4.2', '5.1', '7.1']"
                :key="t"
                size="2xs"
                variant="ghost"
                :color="typeFilter === t ? 'primary' : 'neutral'"
                @click="typeFilter = t as TypeFilter"
              >{{ t === 'all' ? 'Tous' : t }}</UButton>
            </div>
            <div class="flex gap-2 items-center text-xs">
              <span class="text-dimmed">Statut</span>
              <UButton size="2xs" variant="ghost" :color="statusFilter === 'all'     ? 'primary' : 'neutral'" @click="statusFilter = 'all'">Tous</UButton>
              <UButton size="2xs" variant="ghost" :color="statusFilter === 'online'  ? 'primary' : 'neutral'" @click="statusFilter = 'online'">En ligne</UButton>
              <UButton size="2xs" variant="ghost" :color="statusFilter === 'offline' ? 'primary' : 'neutral'" @click="statusFilter = 'offline'">Hors ligne</UButton>
            </div>
            <span class="text-xs text-dimmed whitespace-nowrap">{{ rows.length }} affiché(s)</span>
          </div>
        </UPageCard>

        <!-- ── ALERTES ──────────────────────────────────────────────────────── -->
        <UAlert v-if="!devices.length && wsStatus === 'connected'" color="neutral" icon="i-lucide-inbox" title="Aucun device reçu" description="Le serveur est connecté mais n'a renvoyé aucun appareil." />
        <UAlert v-else-if="wsStatus === 'error' || wsStatus === 'disconnected'" color="error" icon="i-lucide-wifi-off" title="WebSocket déconnecté" description="Reconnexion automatique en cours…" />

        <!-- ── GRILLE cards Option C ────────────────────────────────────────── -->
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="d in rows"
            :key="d.id"
            class="rounded-xl border border-[#252525] bg-[#161616] overflow-hidden flex flex-col transition-opacity"
            :class="{ 'opacity-40': !d.online }"
          >
            <!-- ── En-tête gradient ────────────────────────────────────────── -->
            <div
              class="flex items-start gap-3 px-4 py-3"
              :style="d.online
                ? 'background: linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)'
                : 'background: linear-gradient(135deg,#111 0%,#141414 100%)'"
            >
              <!-- Icône device -->
              <div
                class="size-10 rounded-xl flex items-center justify-center text-lg shrink-0 border"
                :class="d.online
                  ? 'bg-primary/10 border-primary/20'
                  : 'bg-[#1e1e1e] border-[#2a2a2a]'"
              >
                <UIcon name="i-lucide-monitor-speaker" class="size-5" :class="d.online ? 'text-primary' : 'text-[#444]'" />
              </div>

              <!-- Infos -->
              <div class="flex-1 min-w-0">
                <button
                  class="font-bold text-sm leading-tight hover:text-primary transition-colors truncate block"
                  :class="d.online ? 'text-foreground' : 'text-[#444]'"
                  @click="d.online && router.push(`/devices/${d.id}`)"
                >{{ d.name || 'Sans nom' }}</button>
                <div class="text-[10px] text-dimmed font-mono mt-0.5 truncate">
                  {{ d.ip }}<span v-if="d.type"> · {{ d.type }}</span>
                </div>
                <div class="flex gap-1 mt-1.5 flex-wrap">
                  <UBadge size="xs" variant="subtle" :color="d.online ? 'success' : 'neutral'">
                    {{ d.online ? 'En ligne' : 'Hors ligne' }}
                  </UBadge>
                  <UBadge v-if="d.type" size="xs" variant="outline" color="info">{{ d.type }}</UBadge>
                  <UBadge v-if="d.vban?.name" size="xs" variant="outline" color="neutral" class="font-mono">
                    {{ d.vban.name }}
                  </UBadge>
                </div>
              </div>

              <!-- Grand niveau sortie -->
              <div v-if="d.audio?.output" class="shrink-0 text-right">
                <div
                  class="text-2xl font-bold font-mono leading-none tabular-nums"
                  :class="isMuted(d.audio.output.mute) ? 'text-amber-400' : 'text-emerald-400'"
                >
                  {{ outVal(d.key, d.outLevel) }}<span class="text-xs font-normal text-dimmed">%</span>
                </div>
                <div class="text-[9px] text-dimmed mt-1">sortie</div>
              </div>
              <div v-else class="shrink-0 text-dimmed text-[11px] font-mono">#{{ d.id }}</div>
            </div>

            <!-- ── Body : contrôles audio ─────────────────────────────────── -->
            <div class="px-4 py-3 flex-1 space-y-4 text-xs">

              <!-- Sortie -->
              <div v-if="d.audio?.output" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5 font-medium text-[#ccc]">
                    <UIcon name="i-lucide-volume-2" class="size-3.5" /> {{ d.audio?.output?.name}}
                  </span>
                  <span class="text-[10px]" :class="isMuted(d.audio.output.mute) ? 'text-amber-400' : 'text-dimmed'">
                    {{ isMuted(d.audio.output.mute) ? 'MUTE' : 'Mute: off' }}
                  </span>
                </div>
                <!-- Barre VU colorée -->
                <div class="h-3 rounded overflow-hidden bg-[#1c1c1c]">
                  <div
                    class="h-full rounded"
                    :style="{ width: outVal(d.key, d.outLevel) + '%', background: 'linear-gradient(to right,#059669,#34d399 55%,#fbbf24 80%,#ef4444)' }"
                  />
                </div>
                <!-- Slider -->
                <div class="flex items-center gap-2">
                  <UIcon :name="outVal(d.key, d.outLevel) === 0 ? 'i-lucide-volume-x' : 'i-lucide-volume-2'" class="size-3.5 text-dimmed shrink-0" />
                  <div class="flex-1 min-w-0">
                    <input
                      type="range" min="0" max="100"
                      :value="outVal(d.key, d.outLevel)"
                      class="range-primary-0 cursor-pointer"
                      @input="onOutSlider(d.key, +($event.target as HTMLInputElement).value)"
                    />
                  </div>
                </div>
                <!-- Boutons rapides -->
                <div class="flex gap-1">
                  <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key, 'Bump.output.volume', { delta: 5 })">+5%</UButton>
                  <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key, 'Bump.output.volume', { delta: -5 })">-5%</UButton>
                  <UButton size="2xs" variant="ghost" color="warning" @click="send(d.key, 'Toggle.output.mute')">Mute</UButton>
                </div>
                <!-- Canaux repliables -->
                <details v-if="d.audio.output.volume && Object.keys(d.audio.output.volume).length" class="text-[10px]">
                  <summary class="cursor-pointer text-dimmed select-none hover:text-foreground transition-colors">
                    {{ Object.keys(d.audio.output.volume).length }} canaux…
                  </summary>
                  <div class="mt-2 space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    <div v-for="(val, ch) in d.audio.output.volume" :key="ch" class="flex items-center gap-2">
                      <span class="text-dimmed w-14 truncate">{{ ch }}</span>
                      <div class="flex-1 h-1.5 rounded overflow-hidden bg-[#1c1c1c]">
                        <div class="h-full rounded" :style="{ width: outChVal(d.key, ch, Number(val)) + '%', background: 'linear-gradient(to right,#059669,#34d399 60%,#fbbf24 80%,#ef4444)' }" />
                      </div>
                      <input type="range" min="0" max="100" :value="outChVal(d.key, ch, Number(val))" class="range-primary-0 w-16 cursor-pointer" @input="onOutChannelSlider(d.key, ch, +($event.target as HTMLInputElement).value)" />
                      <span class="font-mono w-7 text-right">{{ outChVal(d.key, ch, Number(val)) }}</span>
                    </div>
                  </div>
                </details>
              </div>

              <!-- Séparateur -->
              <hr v-if="d.audio?.output && d.audio?.input" class="border-[#222]" />

              <!-- Entrée -->
              <div v-if="d.audio?.input" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5 font-medium text-[#ccc]">
                    <UIcon name="i-lucide-mic" class="size-3.5" /> {{ d.audio?.input?.name}}
                  </span>
                  <span class="text-[10px]" :class="isMuted(d.audio.input.mute) ? 'text-amber-400' : 'text-dimmed'">
                    {{ isMuted(d.audio.input.mute) ? 'MUTE' : 'Mute: off' }}
                  </span>
                </div>
                <!-- Barre VU violette -->
                <div class="h-3 rounded overflow-hidden bg-[#1c1c1c]">
                  <div
                    class="h-full rounded"
                    :style="{ width: inVal(d.key, d.inLevel) + '%', background: 'linear-gradient(to right,#059669,#a78bfa 55%,#f59e0b 80%,#ef4444)' }"
                  />
                </div>
                <!-- Slider -->
                <div class="flex items-center gap-2">
                  <UIcon :name="inVal(d.key, d.inLevel) === 0 ? 'i-lucide-mic-off' : 'i-lucide-mic'" class="size-3.5 text-dimmed shrink-0" />
                  <div class="flex-1 min-w-0">
                    <input
                      type="range" min="0" max="100"
                      :value="inVal(d.key, d.inLevel)"
                      class="range-purple-0 cursor-pointer"
                      @input="onInSlider(d.key, +($event.target as HTMLInputElement).value)"
                    />
                  </div>
                </div>
                <!-- Boutons rapides -->
                <div class="flex gap-1">
                  <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key, 'Bump.input.volume', { delta: 5 })">+5%</UButton>
                  <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key, 'Bump.input.volume', { delta: -5 })">-5%</UButton>
                  <UButton size="2xs" variant="ghost" color="warning" @click="send(d.key, 'Toggle.input.mute')">Mute</UButton>
                </div>
                <!-- Canaux repliables -->
                <details v-if="d.audio.input.volume && Object.keys(d.audio.input.volume).length" class="text-[10px]">
                  <summary class="cursor-pointer text-dimmed select-none hover:text-foreground transition-colors">
                    {{ Object.keys(d.audio.input.volume).length }} canaux…
                  </summary>
                  <div class="mt-2 space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    <div v-for="(val, ch) in d.audio.input.volume" :key="ch" class="flex items-center gap-2">
                      <span class="text-dimmed w-14 truncate">{{ ch }}</span>
                      <div class="flex-1 h-1.5 rounded overflow-hidden bg-[#1c1c1c]">
                        <div class="h-full rounded" :style="{ width: inChVal(d.key, ch, Number(val)) + '%', background: 'linear-gradient(to right,#059669,#a78bfa 60%,#f59e0b 80%,#ef4444)' }" />
                      </div>
                      <input type="range" min="0" max="100" :value="inChVal(d.key, ch, Number(val))" class="range-purple-0 w-16 cursor-pointer" @input="onInChannelSlider(d.key, ch, +($event.target as HTMLInputElement).value)" />
                      <span class="font-mono w-7 text-right">{{ inChVal(d.key, ch, Number(val)) }}</span>
                    </div>
                  </div>
                </details>
              </div>

              <!-- Pas d'audio -->
              <div v-if="!d.audio" class="flex items-center gap-2 text-dimmed py-2">
                <UIcon name="i-lucide-activity" class="size-3.5" />
                <span>Pas encore de données audio</span>
              </div>
            </div>

            <!-- ── Footer ─────────────────────────────────────────────────── -->
            <div class="border-t border-[#1e1e1e] bg-[#121212] px-4 py-2 flex items-center justify-between">
              <div class="text-[10px] text-dimmed font-mono truncate">
                {{ d.audio?.pcm || '' }}
                <span v-if="d.vban?.channels"> · {{ d.vban.channels }}ch</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-panel-right" @click="openSlideover(d.key)">Détails</UButton>
                <UButton v-if="d.online" size="xs" variant="ghost" color="neutral" icon="i-lucide-external-link" @click="router.push(`/devices/${d.id}`)">Ouvrir</UButton>
                <details class="relative">
                  <summary class="cursor-pointer select-none list-none">
                    <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-code-2" />
                  </summary>
                  <div class="absolute z-10 right-0 bottom-8 w-80 max-h-56 overflow-auto rounded-lg border border-[#252525] bg-[#111] shadow-lg p-2">
                    <pre class="text-[9px] whitespace-pre-wrap break-all text-dimmed">{{ JSON.stringify(d.allconfig, null, 2) }}</pre>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  </div>
</template>
