<!-- DeviceSlideover.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import http from '@/src/lib/https'
import { useToast, useDashboard } from '#imports'
import { useRouter } from 'vue-router'

/* ─── Dashboard ──────────────────────────────────────────────────────────── */
const { isDeviceSlideoverOpen, activeDeviceKey } = useDashboard()
const toast  = useToast?.()
const router = useRouter()

/* ─── Types ──────────────────────────────────────────────────────────────── */
type RawDevice = {
  id: number; name: string; ip: string; port: string
  description: string; type: string; isalive: number; allconfig: any | null
}
type Device = RawDevice & {
  online: boolean; label: string; host: string; serverUrl: string
  vban?: { host?: string; port?: number; name?: string; channels?: number; rate?: number; format?: string }
}
type StateAudio = {
  card: number; pcm: string; id?: string; device?: number
  output?: { volume: Record<string, number>; mute: any } | null
  input?:  { volume: Record<string, number>; mute: any } | null
}
type TypeFilter   = 'all' | '2.0' | '4.2' | '5.1' | '7.1'
type StatusFilter = 'all' | 'online' | 'offline'
type TabName      = 'audio' | 'snap'

type SnapVolume = { muted: boolean; percent: number }
type SnapClient = {
  id: string; connected: boolean; name?: string
  host: { arch?: string; ip: string; mac: string; name: string; os?: string }
  config?: { instance?: number; volume?: SnapVolume; latency?: number; name?: string }
  group_id?: string
}
type SnapGroup  = { id: string; name?: string; muted?: boolean; stream_id?: string; clients: SnapClient[] }
type SnapStream = { id: string; uri?: { raw?: string } }

/* ─── State ──────────────────────────────────────────────────────────────── */
const devices      = ref<Device[]>([])
const loading      = ref(false)
const q            = ref('')
const typeFilter   = ref<TypeFilter>('all')
const statusFilter = ref<StatusFilter>('all')

const audioByKey        = ref<Record<string, StateAudio>>({})
const outPercent        = ref<Record<string, number>>({})
const inPercent         = ref<Record<string, number>>({})
const outChannelPercent = ref<Record<string, Record<string, number>>>({})
const inChannelPercent  = ref<Record<string, Record<string, number>>>({})

const rowRefs = ref<Record<string, HTMLElement | null>>({})

/* ─── Tab state per device ───────────────────────────────────────────────── */
const activeTab = ref<Record<string, TabName>>({})
function getTab(key: string): TabName { return activeTab.value[key] ?? 'audio' }
function setTab(key: string, tab: TabName) { activeTab.value = { ...activeTab.value, [key]: tab } }

/* ─── WebSocket device control ───────────────────────────────────────────── */
const { status: wsStatus, send: wsSend, on: wsOn } = useDeviceControlWs()

watch(wsStatus, s => {
  if (s === 'connected') { wsSend('Get.Device'); wsSend('Get.audio') }
})

const offWs = wsOn((msg: any) => {
  if (msg?.msg?.method === 'State.audio' && msg.from && msg.msg?.State?.audio) {
    audioByKey.value = { ...audioByKey.value, [String(msg.from)]: msg.msg.State.audio as StateAudio }
    return
  }
  if (msg.method === 'RES.Device' && msg.msg) {
    devices.value = (msg.msg as RawDevice[]).map(normalise)
    return
  }
  if (msg.method === 'Error') {
    toast?.add?.({ title: 'Erreur device', description: msg.error || 'Erreur inconnue', color: 'error' })
  }
})

/* ─── Snapcast WS ────────────────────────────────────────────────────────── */
const { status: snapStatus, connect: snapConnect, disconnect: snapDisconnect, send: snapSend, rpc: snapRpc, onNotif: snapOnNotif } = useSnapWs()

const snapGroups  = ref<SnapGroup[]>([])
const snapClients = ref<SnapClient[]>([])
const snapStreams  = ref<SnapStream[]>([])

function snapRefresh() { snapSend({ method: 'Server.GetStatusLocal' }) }

function syncSnapGroupClients() {
  for (const g of snapGroups.value) {
    for (const c of g.clients) {
      const found = snapClients.value.find(x => x.id === c.id)
      if (found) found.group_id = g.id
    }
  }
}

const offSnapNotif = snapOnNotif((msg: any) => {
  if (msg?.id === 'Server.GetStatusLocal') {
    if (Array.isArray(msg.group))   snapGroups.value  = msg.group
    if (Array.isArray(msg.client))  snapClients.value = msg.client
    if (Array.isArray(msg.streams)) snapStreams.value  = msg.streams
    syncSnapGroupClients()
    return
  }
  if (msg?.method === 'Group.OnStreamChanged' && msg.params) {
    const g = snapGroups.value.find(x => x.id === msg.params.id)
    if (g) g.stream_id = msg.params.stream_id
    return
  }
  if (msg?.method === 'Client.OnConnect' && msg.params?.client) {
    const inc = msg.params.client as SnapClient
    const idx = snapClients.value.findIndex(c => c.id === inc.id)
    if (idx >= 0) snapClients.value[idx] = inc; else snapClients.value.push(inc)
    syncSnapGroupClients()
    return
  }
  if (msg?.method === 'Client.OnDisconnect' && msg.params?.id) {
    const c = snapClients.value.find(x => x.id === msg.params.id)
    if (c) c.connected = false
    return
  }
  if (msg?.method === 'Client.OnVolumeChanged' && msg.params) {
    const { id: cid, volume: vol } = msg.params as { id: string; volume: SnapVolume }
    const c = snapClients.value.find(x => x.id === cid)
    if (c) c.config = { ...c.config, volume: vol }
    for (const g of snapGroups.value) {
      const gc = g.clients.find(x => x.id === cid)
      if (gc) gc.config = { ...gc.config, volume: vol }
    }
  }
})

watch(snapStatus, s => { if (s === 'connected') snapRefresh() })

function snapClientByIp(ip: string) { return snapClients.value.find(c => c.host.ip === ip) ?? null }
function snapGroupByIp(ip: string): SnapGroup | null {
  const cl = snapClientByIp(ip)
  if (!cl) return null
  return snapGroups.value.find(g => g.clients.some(c => c.id === cl.id))
      ?? snapGroups.value.find(g => g.id === cl.group_id)
      ?? null
}
async function setSnapStream(groupId: string, streamId: string) {
  try {
    await snapRpc('Group.SetStream', { id: groupId, stream_id: streamId })
    const g = snapGroups.value.find(x => x.id === groupId)
    if (g) g.stream_id = streamId
    toast?.add?.({ title: 'Flux Snap mis à jour', color: 'success' })
  } catch (e: any) {
    toast?.add?.({ title: 'Erreur Snap', description: e?.message, color: 'error' })
  }
}
async function setSnapVolume(clientId: string, percent: number) {
  try {
    await snapRpc('Client.SetVolume', { id: clientId, volume: { muted: false, percent } })
    const c = snapClients.value.find(x => x.id === clientId)
    if (c) c.config = { ...c.config, volume: { muted: false, percent } }
  } catch { /* silent */ }
}

/* ─── Normalisation device ───────────────────────────────────────────────── */
function normalise(d: RawDevice): Device {
  const online    = Number(d.isalive) === 1
  const cfg       = d.allconfig || {}
  const serverCfg = cfg.config?.Server || cfg.config?.server || {}
  const vbanCfg   = cfg.config?.vban || {}
  const host      = d.ip || cfg.interfaces?.address || cfg.ipres || 'n/a'
  const port      = Number(d.port || serverCfg.Port || serverCfg.port || 3007)
  const hasVban   = vbanCfg && Object.keys(vbanCfg).length > 0
  return {
    ...d, online,
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
function deviceKey(d: Device) {
  return d.ip || d.allconfig?.interfaces?.address || d.allconfig?.ipres || d.host || ''
}

/* ─── HTTP devices ───────────────────────────────────────────────────────── */
async function fetchDevices() {
  try {
    loading.value = true
    const res = await http.get<RawDevice[]>('/objet')
    devices.value = (res.data || []).map(normalise)
  } catch {
    toast?.add?.({ title: 'Erreur chargement devices', color: 'error' })
  } finally {
    loading.value = false
  }
}

/* ─── Computed rows ──────────────────────────────────────────────────────── */
const rows = computed(() => {
  let list = devices.value.slice()
  if (typeFilter.value !== 'all')   list = list.filter(d => d.type === typeFilter.value)
  if (statusFilter.value !== 'all') list = list.filter(d => d.online === (statusFilter.value === 'online'))
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
    const inVals  = audio?.input?.volume  ? Object.values(audio.input.volume).map(Number).filter(v => !isNaN(v)) : []
    return {
      ...d, key, audio,
      outLevel: outVals.length ? Math.round(outVals.reduce((a, b) => a + b) / outVals.length) : 0,
      inLevel:  inVals.length  ? Math.round(inVals.reduce( (a, b) => a + b) / inVals.length)  : 0,
    }
  })
})

/* ─── Helpers sliders audio ──────────────────────────────────────────────── */
function outVal  (key: string, fb: number) { return key in outPercent.value ? outPercent.value[key] : fb }
function inVal   (key: string, fb: number) { return key in inPercent.value  ? inPercent.value[key]  : fb }
function outChVal(key: string, ch: string, fb: number) { return outChannelPercent.value[key]?.[ch] ?? fb }
function inChVal (key: string, ch: string, fb: number) { return inChannelPercent.value[key]?.[ch]  ?? fb }
function isMuted (mute: any) { return /on|yes|1|true/i.test(String(mute ?? '')) }

/* ─── Commandes device audio ─────────────────────────────────────────────── */
function send(key: string, method: string, extra: Record<string, any> = {}) {
  const ok = wsSend(method, { targetIp: key, ...extra })
  if (!ok) toast?.add?.({ title: 'WS non connecté', color: 'error' })
}
function onOutSlider(key: string, v: number) {
  outPercent.value = { ...outPercent.value, [key]: v }
  const ch = { ...outChannelPercent.value }; delete ch[key]; outChannelPercent.value = ch
  send(key, 'Set.output.volume', { percent: v })
}
function onInSlider(key: string, v: number) {
  inPercent.value = { ...inPercent.value, [key]: v }
  const ch = { ...inChannelPercent.value }; delete ch[key]; inChannelPercent.value = ch
  send(key, 'Set.input.volume', { percent: v })
}
function onOutChSlider(key: string, ch: string, v: number) {
  outChannelPercent.value = { ...outChannelPercent.value, [key]: { ...(outChannelPercent.value[key] ?? {}), [ch]: v } }
  send(key, 'Set.output.channel', { channel: ch, percent: v })
}
function onInChSlider(key: string, ch: string, v: number) {
  inChannelPercent.value = { ...inChannelPercent.value, [key]: { ...(inChannelPercent.value[key] ?? {}), [ch]: v } }
  send(key, 'Set.input.channel', { channel: ch, percent: v })
}

/* ─── Scroll + highlight ─────────────────────────────────────────────────── */
function scrollTo(key: string) {
  const el = rowRefs.value[key]
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 1500)
}

/* ─── Lifecycle ──────────────────────────────────────────────────────────── */
function requestData() {
  if (wsStatus.value === 'connected') { wsSend('Get.Device'); wsSend('Get.audio') }
}

onMounted(() => { fetchDevices(); requestData() })
onBeforeUnmount(() => { offWs(); offSnapNotif(); snapDisconnect() })

watch(isDeviceSlideoverOpen, async (open) => {
  if (!open) { snapDisconnect(); return }
  snapConnect()
  await fetchDevices()
  requestData()
  const key = activeDeviceKey.value ? String(activeDeviceKey.value) : ''
  if (key) { q.value = key; await nextTick(); scrollTo(key) }
})

watch(activeDeviceKey, async (key) => {
  if (!key) return
  if (!isDeviceSlideoverOpen.value) isDeviceSlideoverOpen.value = true
  q.value = String(key)
  await nextTick(); scrollTo(String(key))
})
</script>

<template>
  <USlideover
    v-model:open="isDeviceSlideoverOpen"
    title="Devices"
    :ui="{ content: 'max-w-5xl w-screen', header: 'px-4 py-3', body: 'px-0 py-0 flex flex-col' }"
  >
    <!-- ── Header ────────────────────────────────────────────────────────── -->
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-semibold text-sm">Devices audio</div>
          <div class="text-[11px] text-dimmed flex items-center gap-1.5">
            <span class="size-1.5 rounded-full" :class="{
              'bg-emerald-400': wsStatus === 'connected',
              'bg-amber-400 animate-pulse': wsStatus === 'connecting',
              'bg-red-400': wsStatus === 'error' || wsStatus === 'disconnected',
            }" />
            {{ wsStatus }} · {{ devices.length }} device(s)
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UInput v-model="q" icon="i-lucide-search" placeholder="Nom, IP…" size="xs" class="w-44" />
          <UButton icon="i-lucide-refresh-ccw" size="xs" color="neutral" :loading="loading" @click="fetchDevices">Refresh</UButton>
        </div>
      </div>
    </template>

    <template #body>
      <!-- Filtres -->
      <div class="px-4 py-2 flex flex-wrap gap-2 items-center border-b border-default text-[10px] shrink-0">
        <span class="text-dimmed">Type</span>
        <UButton v-for="t in ['all','2.0','4.2','5.1','7.1']" :key="t" size="2xs" variant="ghost"
          :color="typeFilter === t ? 'primary' : 'neutral'" @click="typeFilter = t as TypeFilter">
          {{ t === 'all' ? 'Tous' : t }}
        </UButton>
        <span class="text-dimmed ml-2">Statut</span>
        <UButton size="2xs" variant="ghost" :color="statusFilter==='all'?'primary':'neutral'" @click="statusFilter='all'">Tous</UButton>
        <UButton size="2xs" variant="ghost" :color="statusFilter==='online'?'primary':'neutral'" @click="statusFilter='online'">En ligne</UButton>
        <UButton size="2xs" variant="ghost" :color="statusFilter==='offline'?'primary':'neutral'" @click="statusFilter='offline'">Hors ligne</UButton>
        <span class="ml-auto text-dimmed">{{ rows.length }} affiché(s)</span>
      </div>

      <!-- Liste scrollable -->
      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <div
          v-for="d in rows" :key="d.id"
          :ref="el => rowRefs[d.key] = el as HTMLElement | null"
          class="rounded-xl border border-[#252525] bg-[#161616] overflow-hidden"
          :class="{ 'opacity-40': !d.online }"
        >
          <!-- ── En-tête card ─────────────────────────────────────────────── -->
          <div class="flex items-start gap-3 px-4 py-3"
            :style="d.online
              ? 'background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)'
              : 'background:linear-gradient(135deg,#111 0%,#141414 100%)'">
            <div class="size-9 rounded-xl flex items-center justify-center shrink-0 border"
              :class="d.online ? 'bg-primary/10 border-primary/20' : 'bg-[#1e1e1e] border-[#2a2a2a]'">
              <UIcon name="i-lucide-monitor-speaker" class="size-4" :class="d.online ? 'text-primary' : 'text-[#444]'" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <button class="font-bold text-sm hover:text-primary transition-colors truncate"
                  :class="d.online ? 'text-foreground' : 'text-[#444]'"
                  @click="d.online && router.push(`/devices/${d.id}`)">
                  {{ d.name || 'Sans nom' }}
                </button>
                <UBadge size="xs" variant="subtle" :color="d.online ? 'success' : 'neutral'">
                  {{ d.online ? 'En ligne' : 'Hors ligne' }}
                </UBadge>
                <UBadge v-if="d.type" size="xs" variant="outline" color="info">{{ d.type }}</UBadge>
              </div>
              <div class="text-[10px] text-dimmed font-mono mt-0.5 truncate">
                {{ d.ip }}
                <span v-if="d.vban?.name"> · {{ d.vban.name }}</span>
                <span v-if="d.vban?.channels"> {{ d.vban.channels }}ch</span>
                <span v-if="d.audio?.pcm"> · {{ d.audio.pcm }}</span>
              </div>
            </div>
            <div v-if="d.audio?.output" class="shrink-0 text-right">
              <div class="text-xl font-bold font-mono leading-none tabular-nums"
                :class="isMuted(d.audio.output.mute) ? 'text-amber-400' : 'text-emerald-400'">
                {{ outVal(d.key, d.outLevel) }}<span class="text-xs font-normal text-dimmed">%</span>
              </div>
              <div class="text-[9px] text-dimmed mt-0.5">sortie</div>
            </div>
          </div>

          <!-- ── Tabs : Audio | Snap ─────────────────────────────────────── -->
          <div class="flex border-b border-[#222] bg-[#111]">
            <button v-for="tab in (['audio', 'snap'] as TabName[])" :key="tab"
              class="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px"
              :class="getTab(d.key) === tab
                ? 'text-primary border-primary'
                : 'text-dimmed border-transparent hover:text-foreground'"
              @click="setTab(d.key, tab)">
              <UIcon :name="tab === 'audio' ? 'i-lucide-sliders-horizontal' : 'i-lucide-radio'" class="size-3" />
              {{ tab === 'audio' ? 'Audio' : 'Snap' }}
            </button>
          </div>

          <!-- ══════════════════════════════════════════════════════════════ -->
          <!-- TAB AUDIO  — split 50/50 sortie | entrée                    -->
          <!-- ══════════════════════════════════════════════════════════════ -->
          <div v-show="getTab(d.key) === 'audio'">
            <div v-if="d.audio" class="flex text-xs">

              <!-- ▌GAUCHE : Sortie ─────────────────────────────────────── -->
              <div class="w-1/2 p-4 space-y-2 min-w-0">
                <div v-if="d.audio.output" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1.5 font-medium text-[#ccc]">
                      <UIcon name="i-lucide-volume-2" class="size-3.5" /> Sortie
                    </span>
                    <span class="text-[10px]" :class="isMuted(d.audio.output.mute) ? 'text-amber-400' : 'text-dimmed'">
                      {{ isMuted(d.audio.output.mute) ? 'MUTE' : 'off' }}
                    </span>
                  </div>
                  <!-- VU bar -->
                  <div class="h-2 rounded overflow-hidden bg-[#1c1c1c]">
                    <div class="h-full rounded transition-[width] duration-200"
                      :style="{ width:outVal(d.key,d.outLevel)+'%', background:'linear-gradient(to right,#059669,#34d399 55%,#fbbf24 80%,#ef4444)' }" />
                  </div>
                  <!-- Slider master -->
                  <div class="flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <input type="range" min="0" max="100" :value="outVal(d.key,d.outLevel)"
                        class="range-primary-0 cursor-pointer"
                        @input="onOutSlider(d.key,+($event.target as HTMLInputElement).value)" />
                    </div>
                    <span class="w-8 text-right font-mono text-[10px] shrink-0">{{ outVal(d.key,d.outLevel) }}%</span>
                  </div>
                  <!-- Actions -->
                  <div class="flex gap-1 flex-wrap">
                    <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key,'Bump.output.volume',{delta:5})">+5%</UButton>
                    <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key,'Bump.output.volume',{delta:-5})">-5%</UButton>
                    <UButton size="2xs" variant="ghost" color="warning" @click="send(d.key,'Toggle.output.mute')">Mute</UButton>
                  </div>
                  <!-- Canaux -->
                  <details v-if="d.audio.output.volume && Object.keys(d.audio.output.volume).length" class="text-[10px]">
                    <summary class="cursor-pointer text-dimmed select-none hover:text-foreground transition-colors">
                      {{ Object.keys(d.audio.output.volume).length }} canaux…
                    </summary>
                    <div class="mt-2 space-y-2">
                      <div v-for="(val,ch) in d.audio.output.volume" :key="ch" class="space-y-0.5">
                        <div class="flex justify-between">
                          <span class="text-dimmed truncate">{{ ch }}</span>
                          <span class="font-mono">{{ outChVal(d.key,ch,Number(val)) }}</span>
                        </div>
                        <div class="h-1 rounded overflow-hidden bg-[#1c1c1c]">
                          <div class="h-full rounded" :style="{ width:outChVal(d.key,ch,Number(val))+'%', background:'linear-gradient(to right,#059669,#34d399 60%,#fbbf24 80%,#ef4444)' }" />
                        </div>
                        <input type="range" min="0" max="100" :value="outChVal(d.key,ch,Number(val))"
                          class="range-primary-0 cursor-pointer"
                          @input="onOutChSlider(d.key,ch,+($event.target as HTMLInputElement).value)" />
                      </div>
                    </div>
                  </details>
                </div>
                <div v-else class="text-dimmed text-[11px] py-2">Pas de sortie</div>
              </div>

              <!-- Séparateur vertical -->
              <div class="w-px bg-[#1e1e1e] self-stretch shrink-0" />

              <!-- ▐DROITE : Entrée ─────────────────────────────────────── -->
              <div class="w-1/2 p-4 space-y-2 min-w-0">
                <div v-if="d.audio.input" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1.5 font-medium text-[#ccc]">
                      <UIcon name="i-lucide-mic" class="size-3.5" /> Entrée
                    </span>
                    <span class="text-[10px]" :class="isMuted(d.audio.input.mute) ? 'text-amber-400' : 'text-dimmed'">
                      {{ isMuted(d.audio.input.mute) ? 'MUTE' : 'off' }}
                    </span>
                  </div>
                  <!-- VU bar -->
                  <div class="h-2 rounded overflow-hidden bg-[#1c1c1c]">
                    <div class="h-full rounded transition-[width] duration-200"
                      :style="{ width:inVal(d.key,d.inLevel)+'%', background:'linear-gradient(to right,#059669,#a78bfa 55%,#f59e0b 80%,#ef4444)' }" />
                  </div>
                  <!-- Slider master -->
                  <div class="flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <input type="range" min="0" max="100" :value="inVal(d.key,d.inLevel)"
                        class="range-purple-0 cursor-pointer"
                        @input="onInSlider(d.key,+($event.target as HTMLInputElement).value)" />
                    </div>
                    <span class="w-8 text-right font-mono text-[10px] shrink-0">{{ inVal(d.key,d.inLevel) }}%</span>
                  </div>
                  <!-- Actions -->
                  <div class="flex gap-1 flex-wrap">
                    <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key,'Bump.input.volume',{delta:5})">+5%</UButton>
                    <UButton size="2xs" variant="ghost" color="neutral" @click="send(d.key,'Bump.input.volume',{delta:-5})">-5%</UButton>
                    <UButton size="2xs" variant="ghost" color="warning" @click="send(d.key,'Toggle.input.mute')">Mute</UButton>
                  </div>
                  <!-- Canaux -->
                  <details v-if="d.audio.input.volume && Object.keys(d.audio.input.volume).length" class="text-[10px]">
                    <summary class="cursor-pointer text-dimmed select-none hover:text-foreground transition-colors">
                      {{ Object.keys(d.audio.input.volume).length }} canaux…
                    </summary>
                    <div class="mt-2 space-y-2">
                      <div v-for="(val,ch) in d.audio.input.volume" :key="ch" class="space-y-0.5">
                        <div class="flex justify-between">
                          <span class="text-dimmed truncate">{{ ch }}</span>
                          <span class="font-mono">{{ inChVal(d.key,ch,Number(val)) }}</span>
                        </div>
                        <div class="h-1 rounded overflow-hidden bg-[#1c1c1c]">
                          <div class="h-full rounded" :style="{ width:inChVal(d.key,ch,Number(val))+'%', background:'linear-gradient(to right,#059669,#a78bfa 60%,#f59e0b 80%,#ef4444)' }" />
                        </div>
                        <input type="range" min="0" max="100" :value="inChVal(d.key,ch,Number(val))"
                          class="range-purple-0 cursor-pointer"
                          @input="onInChSlider(d.key,ch,+($event.target as HTMLInputElement).value)" />
                      </div>
                    </div>
                  </details>
                </div>
                <div v-else class="text-dimmed text-[11px] py-2">Pas d'entrée</div>
              </div>
            </div>

            <div v-else class="px-4 py-3 flex items-center gap-2 text-dimmed text-xs">
              <UIcon name="i-lucide-activity" class="size-3.5" />
              <span>Pas encore de données audio</span>
            </div>
          </div>

          <!-- ══════════════════════════════════════════════════════════════ -->
          <!-- TAB SNAP                                                      -->
          <!-- ══════════════════════════════════════════════════════════════ -->
          <div v-show="getTab(d.key) === 'snap'" class="px-4 py-3 space-y-3 text-xs">
            <!-- Status -->
            <div class="flex items-center gap-2">
              <span class="size-1.5 rounded-full shrink-0" :class="{
                'bg-emerald-400':             snapStatus==='connected',
                'bg-amber-400 animate-pulse': snapStatus==='connecting',
                'bg-red-400':                 snapStatus==='error'||snapStatus==='disconnected',
                'bg-[#444]':                  snapStatus==='idle',
              }" />
              <span class="text-dimmed">Snapcast {{ snapStatus }}</span>
              <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-refresh-ccw"
                class="ml-auto" @click="snapRefresh">Sync</UButton>
            </div>

            <template v-if="snapClientByIp(d.ip)">
              <div class="rounded-lg border border-[#222] bg-[#1a1a1a] divide-y divide-[#222] overflow-hidden">
                <!-- Client info -->
                <div class="flex items-center gap-2 px-3 py-2">
                  <UIcon name="i-lucide-wifi" class="size-3.5 shrink-0"
                    :class="snapClientByIp(d.ip)?.connected ? 'text-emerald-400' : 'text-red-400'" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="font-medium truncate">{{ snapClientByIp(d.ip)?.host.name || d.ip }}</span>
                      <UBadge size="xs" variant="subtle"
                        :color="snapClientByIp(d.ip)?.connected ? 'success' : 'error'">
                        {{ snapClientByIp(d.ip)?.connected ? 'Connecté' : 'Déconnecté' }}
                      </UBadge>
                    </div>
                    <div class="text-[10px] text-dimmed font-mono">{{ snapClientByIp(d.ip)?.id }}</div>
                  </div>
                </div>
                <!-- Groupe + Flux -->
                <div v-if="snapGroupByIp(d.ip)" class="px-3 py-2 space-y-2">
                  <div class="flex items-center gap-2 text-[10px] text-dimmed">
                    <UIcon name="i-lucide-layers" class="size-3 shrink-0" />
                    Groupe : <span class="font-mono text-foreground">{{ snapGroupByIp(d.ip)?.id }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-activity" class="size-3.5 text-dimmed shrink-0" />
                    <span class="text-dimmed shrink-0">Flux :</span>
                    <select
                      class="flex-1 min-w-0 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-primary/40"
                      :value="snapGroupByIp(d.ip)?.stream_id || ''"
                      @change="setSnapStream(snapGroupByIp(d.ip)!.id,($event.target as HTMLSelectElement).value)">
                      <option v-if="!snapStreams.length" value="" disabled>Aucun flux</option>
                      <option v-for="s in snapStreams" :key="s.id" :value="s.id">
                        {{ s.id }}{{ s.uri?.raw ? ` — ${s.uri.raw.split('?')[0]}` : '' }}
                      </option>
                    </select>
                  </div>
                </div>
                <div v-else class="px-3 py-2 text-dimmed text-[10px]">Aucun groupe pour ce client</div>
                <!-- Volume Snap -->
                <div v-if="snapClientByIp(d.ip)?.config?.volume !== undefined" class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-volume-2" class="size-3.5 text-dimmed shrink-0" />
                    <div class="flex-1 min-w-0">
                      <input type="range" min="0" max="100"
                        :value="snapClientByIp(d.ip)?.config?.volume?.percent ?? 100"
                        class="range-primary-0 cursor-pointer"
                        @change="setSnapVolume(snapClientByIp(d.ip)!.id,+($event.target as HTMLInputElement).value)" />
                    </div>
                    <span class="w-8 text-right font-mono text-[10px]">{{ snapClientByIp(d.ip)?.config?.volume?.percent ?? 100 }}%</span>
                    <UBadge v-if="snapClientByIp(d.ip)?.config?.volume?.muted" size="xs" color="warning" variant="subtle">Mute</UBadge>
                  </div>
                  <div v-if="snapClientByIp(d.ip)?.config?.latency !== undefined"
                    class="text-[10px] text-dimmed flex items-center gap-1 mt-1">
                    <UIcon name="i-lucide-timer" class="size-3" />
                    Latence : {{ snapClientByIp(d.ip)?.config?.latency }}ms
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="py-6 text-center text-dimmed">
              <UIcon name="i-lucide-wifi-off" class="size-6 mx-auto mb-2 opacity-40" />
              <div>Aucun client Snapcast pour {{ d.ip }}</div>
              <div class="text-[10px] mt-1">{{ snapStatus !== 'connected' ? 'Vérifiez la connexion Snap' : 'Device non enregistré dans Snapcast' }}</div>
            </div>
          </div>

          <!-- ── Footer ──────────────────────────────────────────────────── -->
          <div class="border-t border-[#1e1e1e] bg-[#121212] px-4 py-2 flex items-center gap-2">
            <UButton size="2xs" variant="ghost" color="neutral" icon="i-lucide-external-link"
              @click="router.push(`/devices/${d.id}`)">Ouvrir</UButton>
            <span class="ml-auto text-[9px] text-dimmed font-mono truncate">{{ d.serverUrl }}</span>
          </div>
        </div>

        <div v-if="!rows.length && !loading" class="py-8 text-center text-dimmed text-xs">
          Aucun device trouvé
        </div>
      </div>
    </template>
  </USlideover>
</template>
