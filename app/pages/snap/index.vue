<script setup lang="ts">
import { getSnapState, restoreSnap, clearSnapState, hasSnapState } from '@/src/api/snap'

const { menue } = useDashboard()
const toast = useToast()

/** ========= Types ========= */
type SnapVolume = {
  muted: boolean
  percent: number
}

type HostInfo = {
  arch?: string
  ip: string
  mac: string
  name: string
  os?: string
}

type SnapClient = {
  id: string
  connected: boolean
  name?: string
  host: HostInfo
  config?: {
    instance?: number
    volume?: SnapVolume
    latency?: number
    name?: string
    channel_map?: number[]
  }
  device?: {
    channels?: number       // nb de sorties du périphérique du client
    bits?: number
    rate?: number
    description?: string
    name?: string
  }
  group_id?: string
}

type SnapGroup = {
  id: string
  name?: string
  muted?: boolean
  stream_id?: string
  clients: SnapClient[]
}

type SnapStream = {
  id: string
  uri?: {
    raw?: string
    query?: {
      sampleformat?: string   // "48000:16:8" → rate:bits:canaux
      codec?: string
      name?: string
      chunk_ms?: string
    }
  }
}

/** ========= Config ========= */
const DEBUG = false

/** ========= WebSocket (useSnapWs) ========= */
const { status, connect, disconnect, send, rpc, onNotif } = useSnapWs()
const connected = computed(() => status.value === 'connected')

/** ========= State ========= */

const groups = ref<SnapGroup[]>([])
const clients = ref<SnapClient[]>([])
const streams = ref<SnapStream[]>([])

/** clients cochés par groupe */
const selectedClientsByGroup = ref<Record<string, string[]>>({})

const log = (...a: any[]) => {
  if (DEBUG) console.log('[snap]', ...a)
}

const ok = (m: string) => toast.add({ title: m, color: 'success' })
const err = (m: string) => toast.add({ title: m, color: 'error' })
const info = (m: string) => toast.add({ title: m, color: 'neutral' })

/** ========= Notifications serveur ========= */
const offNotif = onNotif((msg) => {
  log('message', msg)

  // Réponse à Server.GetStatusLocal (id string, pas numérique)
  if (msg?.id === 'Server.GetStatusLocal') {
    if (Array.isArray(msg.group)) groups.value = msg.group
    if (Array.isArray(msg.client)) clients.value = msg.client
    if (Array.isArray(msg.streams)) streams.value = msg.streams
    syncGroupsFromClients()
    for (const g of groups.value) ensureGroupSelection(g.id)
    return
  }

  if (msg?.method === 'Client.OnVolumeChanged' && msg.params) {
    const clientId = String(msg.params.id || '')
    const volume = msg.params.volume as SnapVolume
    if (clientId && volume) upsertClientVolume(clientId, volume)
    return
  }

  if (msg?.method === 'Client.OnChannelMapChanged' && msg.params) {
    const clientId = String(msg.params.id || '')
    const channelMap = msg.params.channel_map as number[]
    if (clientId && Array.isArray(channelMap)) upsertClientChannelMap(clientId, channelMap)
    return
  }

  if (msg?.method === 'Group.OnStreamChanged' && msg.params) {
    const gid = String(msg.params.id || '').toLowerCase()
    const streamId = String(msg.params.stream_id || '')
    const g = groups.value.find(x => x.id.toLowerCase() === gid)
    if (g) g.stream_id = streamId
    return
  }

  if (msg?.method === 'Client.OnConnect' && msg.params?.client) {
    const incoming = msg.params.client as SnapClient
    const idx = clients.value.findIndex(c => c.id.toLowerCase() === incoming.id.toLowerCase())
    if (idx >= 0) clients.value[idx] = incoming
    else clients.value.push(incoming)
    syncGroupsFromClients()
    return
  }

  if (msg?.method === 'Client.OnDisconnect' && msg.params?.id) {
    const cid = String(msg.params.id).toLowerCase()
    const c = clients.value.find(x => x.id.toLowerCase() === cid)
    if (c) c.connected = false
    syncGroupsFromClients()
  }
})

// Statut de connexion → toast + refresh initial
watch(status, (s) => {
  if (s === 'connected') {
    ok('Connecté au Snapserver')
    send({ method: 'Server.GetStatusLocal' })
  } else if (s === 'disconnected') {
    info('Déconnecté')
  }
})

/** ========= Helpers ========= */
function getFirstClient(g: SnapGroup): SnapClient | null {
  if (!g?.clients?.length) return null
  return g.clients[0]
}

function alive(b: boolean) {
  return b ? 'En ligne' : 'Hors ligne'
}

function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n))
}

function upsertClientVolume(clientId: string, volume: SnapVolume) {
  const cid = clientId.toLowerCase()

  const c = clients.value.find(x => x.id.toLowerCase() === cid)
  if (c) {
    c.config = {
      ...c.config,
      volume
    }
  }

  for (const g of groups.value) {
    const gc = g.clients?.find(x => x.id.toLowerCase() === cid)
    if (gc) {
      gc.config = {
        ...gc.config,
        volume
      }
    }
  }
}

function upsertClientChannelMap(clientId: string, channel_map: number[]) {
  const cid = clientId.toLowerCase()

  const c = clients.value.find(x => x.id.toLowerCase() === cid)
  if (c) {
    c.config = {
      ...c.config,
      channel_map
    }
  }

  for (const g of groups.value) {
    const gc = g.clients?.find(x => x.id.toLowerCase() === cid)
    if (gc) {
      gc.config = {
        ...gc.config,
        channel_map
      }
    }
  }
}

function syncGroupsFromClients() {
  for (const g of groups.value) {
    g.clients = clients.value.filter(c => c.group_id?.toLowerCase() === g.id.toLowerCase())
  }
}

function ensureGroupSelection(groupId: string) {
  if (!selectedClientsByGroup.value[groupId]) {
    selectedClientsByGroup.value[groupId] = []
  }
}

function getAvailableClientsForGroup(groupId: string) {
  const gid = groupId.toLowerCase()
  return clients.value.filter(c => c.connected && c.group_id?.toLowerCase() !== gid)
}

function refresh() {
  send({ method: 'Server.GetStatusLocal' })
}

/** ========= Commands ========= */
function rpcClientSetGroup(clientId: string, groupId: string) {
  return rpc('Client.SetGroup', { id: clientId, group: groupId })
}

function rpcGroupSetName(groupId: string, name: string) {
  return rpc('Group.SetName', { id: groupId, name })
}

function rpcGroupSetStream(groupId: string, streamId: string) {
  return rpc('Group.SetStream', { id: groupId, stream_id: streamId })
}

async function setClientVolume(clientId: string, percent: number) {
  const safe = clamp(percent)
  try {
    await rpc('Client.SetVolume', { id: clientId, volume: { muted: false, percent: safe } })
    upsertClientVolume(clientId, { muted: false, percent: safe })
  } catch (e: any) {
    err(e?.message || 'Client.SetVolume a échoué')
  }
}

async function toggleMute(clientId: string, v?: SnapVolume) {
  const muted = !!v?.muted
  const percent = Number(v?.percent ?? 0)
  try {
    await rpc('Client.SetVolume', { id: clientId, volume: { muted: !muted, percent } })
    upsertClientVolume(clientId, { muted: !muted, percent })
  } catch (e: any) {
    err(e?.message || 'Mute a échoué')
  }
}

/* Nombre de canaux d'un flux (depuis sampleformat "48000:16:8" → 8) */
function streamChannels(streamId?: string): number {
  const s = streams.value.find(x => x.id === streamId)
  const ch = Number(s?.uri?.query?.sampleformat?.split(':')[2])
  return Number.isInteger(ch) && ch > 0 ? ch : 0
}

/* Envoie Client.SetChannelMap { id, channel_map: [...] } (+ MàJ optimiste) */
async function applyChannelMap(clientId: string, channel_map: number[]) {
  try {
    await rpc('Client.SetChannelMap', { id: clientId, channel_map })
    upsertClientChannelMap(clientId, channel_map)
    ok('Channel map mis à jour')
  } catch (e: any) {
    err(e?.message || 'Client.SetChannelMap a échoué')
  }
}

/* ── Modal de routage (channel map) ─────────────────────────────────────── */
const cmOpen       = ref(false)
const cmClient     = ref<SnapClient | null>(null)
const cmChannels   = ref(0)             // nb de canaux SOURCE (lignes)
const cmMaxOutputs = ref(0)             // sorties autorisées = device.channels (colonnes max)
const cmDraft      = ref<number[]>([])  // sortie i → source cmDraft[i]

function openChannelMap(c: SnapClient, g: SnapGroup) {
  cmChannels.value   = streamChannels(g.stream_id)                     // sources dispo
  cmMaxOutputs.value = c.device?.channels ?? cmChannels.value          // sorties autorisées (device)
  const cm = c.config?.channel_map
  const src = Math.max(0, cmChannels.value - 1)
  cmDraft.value = (Array.isArray(cm) && cm.length)
    ? cm.slice(0, cmMaxOutputs.value).map(v => Math.min(Number(v) || 0, src))   // borné aux sorties/sources
    : Array.from({ length: cmMaxOutputs.value }, (_, i) => Math.min(i, src))     // défaut identité
  cmClient.value = c
  cmOpen.value = true
}

/* Application EN DIRECT à chaque changement */
function applyDraft() {
  if (cmClient.value) applyChannelMap(cmClient.value.id, [...cmDraft.value])
}
function setOutput(i: number, src: number) { cmDraft.value[i] = src; applyDraft() }
function addOutput() {
  if (cmDraft.value.length >= cmMaxOutputs.value) return   // pas plus que device.channels
  cmDraft.value.push(0); applyDraft()
}
function removeOutput(i: number) { cmDraft.value.splice(i, 1); applyDraft() }
async function removeClientFromGroup(groupId: string, clientId: string) {
  const group = groups.value.find(g => g.id === groupId)

  if (!group) {
    err('Groupe introuvable')
    return
  }
  const currentIds = (group.clients || []).map(c => c.id)
  const nextIds = currentIds.filter(id => id !== clientId)

  try {
    if (currentIds.length <= 1) {
      err('Impossible de retirer le dernier client du groupe')
      return
    }
    // envoi au proxy
    sendGroupClientsToProxy(groupId, nextIds)

    // mise à jour optimiste locale
    group.clients = group.clients.filter(c => c.id !== clientId)

    ok('Client retiré du groupe')

    setTimeout(() => {
      refresh()
    }, 300)
  } catch (e: any) {
    err(e?.message || 'Suppression du client du groupe impossible')
  }
}

async function setGroupStream(groupId: string, streamId: string) {
  try {
    await rpcGroupSetStream(groupId, streamId)
    const g = groups.value.find(x => x.id === groupId)
    if (g) g.stream_id = streamId
    ok('Flux du groupe mis à jour')
  } catch (e: any) {
    err(e?.message || 'Group.SetStream a échoué')
  }
}

function askGroupName(currentName = '') {
  if (typeof window === 'undefined') {
    return currentName
  }
  return window.prompt('Nouveau nom de groupe', currentName) || currentName || ''
}

async function addClientsToGroup(groupId: string) {
  const selected = selectedClientsByGroup.value[groupId] || []
  const group = groups.value.find(g => g.id === groupId)

  if (!group) {
    err('Groupe introuvable')
    return
  }

  if (!selected.length) {
    err('Aucun client sélectionné')
    return
  }

  try {
    // on garde les clients déjà présents
    const currentIds = (group.clients || []).map(c => c.id)

    // fusion sans doublons
    const merged = Array.from(new Set([...currentIds, ...selected]))

    // ✅ envoi vers le proxy au bon format
    sendGroupClientsToProxy(groupId, merged)

    ok('Demande envoyée au proxy')
    selectedClientsByGroup.value[groupId] = []

    // petit refresh après envoi
    setTimeout(() => {
      refresh()
    }, 300)
  } catch (e: any) {
    err(e?.message || 'Ajout au groupe impossible')
  }
}

function onWheelMaster(e: WheelEvent, clientId?: string, vol?: SnapVolume) {
  if (!clientId) return
  const step = e.shiftKey ? 5 : 3
  const delta = e.deltaY > 0 ? -step : step
  const current = Number(vol?.percent ?? 0)
  const next = clamp(current + delta)

  if (next !== current) setClientVolume(clientId, next)
  e.preventDefault()
}

/** ========= Create Group ========= */
const showCreate = ref(false)
const creating = ref(false)
const newGroupName = ref('')
const newGroupStream = ref<string>('')
const newGroupClientIds = ref<string[]>([])

const streamOptions = computed(() =>
  streams.value.map(s => ({
    label: s.id,
    value: s.id,
    description: s.uri?.raw || ''
  }))
)

const connectedClients = computed(() =>
  clients.value.filter(c => c.connected)
)

function openCreate() {
  newGroupName.value = ''
  newGroupStream.value = streams.value[0]?.id || ''
  newGroupClientIds.value = []
  showCreate.value = true
}
function sendGroupClientsToProxy(groupId: string, clientIds: string[]) {
  const sent = send({
    method: 'Group.SetClients',
    params: { id: groupId, clients: clientIds }
  })
  if (!sent) err('WebSocket non connecté')
}

async function submitCreate() {
  if (creating.value) return

  if (!newGroupName.value.trim()) {
    err('Nom requis')
    return
  }

  if (!newGroupStream.value) {
    err('Sélectionne un flux')
    return
  }

  if (!connectedClients.value.length) {
    err('Aucun client connecté : impossible de créer un groupe côté Snapserver.')
    return
  }

  if (!newGroupClientIds.value.length) {
    err('Sélectionne au moins un client connecté.')
    return
  }

  creating.value = true
  const newId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

  try {
    groups.value.unshift({
      id: newId,
      name: newGroupName.value,
      stream_id: newGroupStream.value,
      clients: []
    })

    await rpcGroupSetName(newId, newGroupName.value)
    await rpcGroupSetStream(newId, newGroupStream.value)
    sendGroupClientsToProxy(newId, newGroupClientIds.value)

    ok('Groupe créé et configuré')
    showCreate.value = false
    refresh()
  } catch (e: any) {
    err(`Création échouée: ${e?.message || e}`)
    groups.value = groups.value.filter(g => g.id !== newId)
  } finally {
    creating.value = false
  }
}

/** ========= Restauration (persistance serveur) ========= */
const snapHasState = ref(false)
const restoring = ref(false)
const stateBusy = ref(false)

async function loadSnapState() {
  try { snapHasState.value = hasSnapState(await getSnapState()) }
  catch { /* noop */ }
}

async function restoreState() {
  if (!confirm('Réappliquer la configuration sauvegardée (regroupements, noms, flux, volumes) ?')) return
  restoring.value = true
  try {
    await restoreSnap()
    ok('Configuration restaurée')
    setTimeout(refresh, 400)
  } catch (e: any) {
    err(e?.response?.data?.error || e?.message || 'Restauration impossible')
  } finally { restoring.value = false }
}

async function clearState() {
  if (!confirm('Effacer la configuration Snapcast sauvegardée ?')) return
  stateBusy.value = true
  try {
    await clearSnapState()
    snapHasState.value = false
    ok('Configuration sauvegardée effacée')
  } catch (e: any) {
    err(e?.response?.data?.error || 'Suppression impossible')
  } finally { stateBusy.value = false }
}

/** ========= UI ========= */
const hasAnyData = computed(() => groups.value.length > 0 || streams.value.length > 0)

/** ========= Lifecycle ========= */
onMounted(() => { connect(); loadSnapState() })

onUnmounted(() => {
  offNotif()
  disconnect()
})
</script>

<template>
  <div class="flex flex-col min-h-0 flex-1">
    <UDashboardNavbar
      class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default"
      style="height: 120px;"
    >
      <template #leading>
        <UPageCard
          title="SnapCast"
          :description="`État: ${connected ? 'connecté' : 'déconnecté'} • Groupes: ${groups.length} • Flux: ${streams.length}`"
          variant="naked"
          orientation="horizontal"
          :ui="{ container: 'p-4 sm:p-4 gap-3' }"
          class="mb-0 flex items-center"
        >
          <div class="flex items-center gap-2 w-full lg:w-auto lg:ms-auto">
            <UButton
              :color="connected ? 'primary' : 'error'"
              :icon="connected ? 'i-lucide-link-2' : 'i-lucide-link-2-off'"
              @click="connected ? disconnect() : connect()"
            >
              {{ connected ? 'Connecté' : 'Déconnecté' }}
            </UButton>

            <UButton color="neutral" icon="i-lucide-refresh-ccw" @click="refresh">
              Rafraîchir
            </UButton>

            <UTooltip :text="snapHasState ? 'Réappliquer la configuration sauvegardée' : 'Aucune configuration sauvegardée'">
              <UButton
                color="neutral" icon="i-lucide-history"
                :loading="restoring" :disabled="!snapHasState"
                @click="restoreState"
              >
                Restaurer
              </UButton>
            </UTooltip>

            <UTooltip text="Effacer la configuration sauvegardée">
              <UButton
                color="error" variant="ghost" icon="i-lucide-trash-2"
                :loading="stateBusy" :disabled="!snapHasState"
                @click="clearState"
              />
            </UTooltip>

            <UButton color="primary" icon="i-lucide-plus" @click="openCreate">
              Nouveau groupe
            </UButton>
          </div>
        </UPageCard>
      </template>
    </UDashboardNavbar>

    <main class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8">
      <div class="w-full lg:max-w-12xl py-6 sm:py-4 lg:py-6">
        <UCard v-if="!hasAnyData" class="border-dashed">
          <UEmpty
            icon="i-lucide-database"
            title="Aucune donnée"
            description="Aucun groupe/flux reçu. Connecte-toi puis rafraîchis l'état."
          >
            <template #actions>
              <div class="flex gap-2">
                <UButton @click="connect" icon="i-lucide-link-2">
                  Se connecter
                </UButton>
                <UButton color="neutral" icon="i-lucide-refresh-ccw" @click="refresh">
                  Rafraîchir
                </UButton>
                <UButton color="primary" icon="i-lucide-plus" @click="openCreate">
                  Nouveau groupe
                </UButton>
              </div>
            </template>
          </UEmpty>
        </UCard>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <UCard v-for="g in groups" :key="g.id" class="flex flex-col">
            <div class="flex items-start gap-3">
              <div class="rounded-lg bg-elevated/50 p-2">
                <UIcon name="i-lucide-users" class="size-5" />
              </div>

              <div class="min-w-0">
                <div class="font-medium truncate">{{ g.name || g.id }}</div>
                <div class="text-xs text-dimmed">{{ g.clients?.length || 0 }} client(s)</div>

                <div v-if="getFirstClient(g)" class="mt-1 text-xs flex items-center gap-2">
                  <UBadge :color="getFirstClient(g)?.connected ? 'primary' : 'error'" variant="subtle">
                    {{ alive(!!getFirstClient(g)?.connected) }}
                  </UBadge>
                  <UBadge :color="g.muted ? 'primary' : 'error'" variant="subtle">
                    {{ "Mute" }}
                  </UBadge>
                  <UBadge variant="subtle" color="primary">
                    {{ g.stream_id || '—' }}
                  </UBadge>
                </div>
              </div>

              <div class="ms-auto flex items-center gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  icon="i-lucide-edit-2"
                  variant="ghost"
                  @click="rpcGroupSetName(g.id, askGroupName(g.name))"
                />
                <UTooltip :text="g.clients?.length ? `Réassigne d'abord les clients` : 'Supprimer localement'">
                  <UButton
                    size="xs"
                    color="error"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    :disabled="!!g.clients?.length"
                    @click="groups = groups.filter(x => x.id !== g.id)"
                  />
                </UTooltip>
              </div>
            </div>

            <div class="mt-4">
              <div class="text-sm text-dimmed mb-1">Flux du groupe</div>

              <div class="flex flex-wrap gap-2">
                <div
                  v-for="opt in streamOptions"
                  :key="opt.value"
                  role="option"
                  :aria-selected="opt.value === g.stream_id"
                  class="cursor-pointer rounded-md border px-2.5 py-1.5 text-sm transition-colors max-w-full"
                  :class="opt.value === g.stream_id
                    ? 'bg-primary text-inverted border-primary'
                    : 'bg-default hover:bg-elevated/60 border-default'"
                  @click="() => {
                    if (g.stream_id !== opt.value) {
                      g.stream_id = opt.value
                      setGroupStream(g.id, opt.value)
                    }
                  }"
                >
                  <div class="font-medium truncate">{{ opt.label }}</div>
                </div>
              </div>
            </div>

            <div v-if="g.clients?.length" class="mt-4 space-y-3">
              <div
                v-for="c in g.clients"
                :key="c.id"
                class="rounded-md border border-default/60 p-2 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <div class="text-sm truncate">
                    {{ c.name || c.host?.name || c.id }}
                    <span class="text-dimmed">· {{ c.host?.ip }}#{{ c.config?.name || c.config?.instance }}</span>
                  </div>

                  <div class="flex items-center gap-2">
                    <UBadge :color="c.connected ? 'primary' : 'error'" variant="subtle">
                      {{ alive(c.connected) }}
                    </UBadge>

                    <UTooltip text="Retirer du groupe">
                      <UButton
                        size="xs"
                        color="error"
                        variant="ghost"
                        icon="i-lucide-user-minus"
                        @click="removeClientFromGroup(g.id, c.id)"
                      />
                    </UTooltip>
                  </div>
                </div>

                <div v-if="c.connected" class="flex items-center justify-between">
                  <UBadge variant="subtle">
                    {{ c.config?.volume?.percent ?? 0 }}%
                  </UBadge>

                  <UButton
                    size="xs"
                    :color="c.config?.volume?.muted ? 'error' : 'neutral'"
                    :icon="c.config?.volume?.muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
                    @click="toggleMute(c.id, c.config?.volume)"
                  />
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  :value="c.config?.volume?.percent ?? 0"
                  class="w-full accent-current h-1.5 range-primary-0"
                  @input="setClientVolume(c.id, ($event.target as HTMLInputElement).valueAsNumber)"
                  @wheel.prevent="onWheelMaster($event, c.id, c.config?.volume)"
                />

                <!-- Routage (channel map) : ouvre un modal de menus par canal de sortie -->
                <div v-if="streamChannels(g.stream_id) > 0" class="flex items-center gap-2">
                  <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-route" @click="openChannelMap(c, g)">
                    Routage
                  </UButton>
                  <span v-if="c.config?.channel_map?.length" class="text-xs text-dimmed font-mono truncate">
                    [{{ c.config.channel_map.join(', ') }}]
                  </span>
                </div>
              </div>
            </div>

            <!-- AJOUTER DES CLIENTS AU GROUPE -->
            <div class="mt-4 space-y-3">
              <div class="rounded-md border border-default/60 p-3 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="text-sm font-medium">Ajouter au groupe</div>
                  <div class="flex justify-end">
                    <UButton
                      size="xs"
                      color="primary"
                      :disabled="!(selectedClientsByGroup[g.id]?.length)"
                      @click="addClientsToGroup(g.id)"
                    >
                      Ajouter au groupe
                    </UButton>
                  </div>
                  <UBadge variant="subtle">
                    {{ selectedClientsByGroup[g.id]?.length || 0 }} sélec
                  </UBadge>
                </div>

                <div
                  v-if="getAvailableClientsForGroup(g.id).length"
                  class="space-y-2 max-h-40 overflow-y-auto"
                >
                  <div
                    v-for="value in getAvailableClientsForGroup(g.id)"
                    :key="value.id"
                    class="flex items-center justify-between gap-2"
                  >
                    <div class="text-sm truncate">
                      {{ value.host?.name || value.id }}
                      <span class="text-dimmed">· {{ value.host?.ip }}#{{ value.config?.name || value.config?.instance }}</span>
                    </div>

                    <UCheckbox
                      :model-value="selectedClientsByGroup[g.id]?.includes(value.id)"
                      @update:model-value="(checked) => {
                        ensureGroupSelection(g.id)
                        if (checked) {
                          if (!selectedClientsByGroup[g.id].includes(value.id)) {
                            selectedClientsByGroup[g.id].push(value.id)
                          }
                        } else {
                          selectedClientsByGroup[g.id] =
                            selectedClientsByGroup[g.id].filter(id => id !== value.id)
                        }
                      }"
                    />
                  </div>
                </div>

                <div v-else class="text-xs text-dimmed">
                  Aucun client connecté disponible à ajouter.
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <UAlert
          v-if="connectedClients.length === 0"
          class="mt-6"
          color="amber"
          title="Aucun client connecté"
          description="La création d'un groupe nécessite au moins un client en ligne. Allume un client puis réessaie."
          variant="subtle"
        />
      </div>
    </main>

    <UCard v-if="showCreate" :ui="{ body: 'space-y-4' }" class="max-w-lg mx-auto mt-6">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-plus" class="size-5" />
          <h3 class="font-semibold">Nouveau groupe</h3>
          <UButton
            class="ms-auto"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            @click="showCreate = false"
          />
        </div>
      </template>

      <div>
        <label class="text-sm text-dimmed">Nom</label>
        <UInput v-model="newGroupName" placeholder="ex. Salon" class="mt-2" />
      </div>

      <div>
        <div class="text-sm text-dimmed mb-1">Flux initial</div>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="opt in streamOptions"
            :key="`create-${opt.value}`"
            class="cursor-pointer rounded-md border px-2.5 py-1.5 text-sm transition-colors"
            :class="newGroupStream === opt.value
              ? 'bg-primary text-inverted border-primary'
              : 'bg-default hover:bg-elevated/60 border-default'"
            @click="newGroupStream = opt.value"
          >
            <div class="font-medium truncate">{{ opt.label }}</div>
            <div v-if="opt.description" class="text-xs opacity-80 truncate max-w-[28ch]">
              {{ opt.description }}
            </div>
          </div>
        </div>

        <div v-if="!streams.length" class="text-xs text-dimmed mt-1">
          Aucun flux disponible
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <div class="text-sm text-dimmed mb-1">Assigner des clients (connectés)</div>
          <UBadge variant="subtle">{{ newGroupClientIds.length }} sélectionné(s)</UBadge>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
          <label
            v-for="c in connectedClients"
            :key="`pick-${c.id}`"
            class="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer"
            :class="newGroupClientIds.includes(c.id)
              ? 'border-primary ring-1 ring-primary'
              : 'border-default hover:bg-elevated/50'"
          >
            <input
              class="accent-primary"
              type="checkbox"
              :value="c.id"
              v-model="newGroupClientIds"
            />
            <span class="truncate">{{ c.host?.name || c.id }}</span>
            <span class="text-dimmed truncate">· {{ c.host?.ip }}</span>
          </label>
        </div>

        <div v-if="connectedClients.length === 0" class="text-xs text-dimmed mt-2">
          Aucun client en ligne — démarre un client pour pouvoir créer le groupe.
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">
            Annuler
          </UButton>
          <UButton
            color="primary"
            :loading="creating"
            :disabled="!newGroupName || !newGroupStream || !connectedClients.length || !newGroupClientIds.length"
            @click="submitCreate"
          >
            Créer
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Modal Routage (channel map) — matrice source × sortie, application en direct -->
    <UModal v-model:open="cmOpen" :title="`Routage — ${cmClient?.name || cmClient?.host?.name || cmClient?.id || ''}`" :ui="{ content: 'max-w-fit' }">
      <template #content>
        <div class="p-5 space-y-3">
          <div class="flex items-center justify-between gap-4">
            <p class="text-xs text-dimmed">
              Ligne = <b>source</b>, colonne = <b>sortie</b>. Clic = router (en direct).
              <span class="text-dimmed/70">· {{ cmDraft.length }}/{{ cmMaxOutputs }} sorties</span>
            </p>
            <UButton
              icon="i-lucide-plus" size="xs" variant="soft" color="neutral"
              :disabled="cmDraft.length >= cmMaxOutputs"
              @click="addOutput"
            >Sortie</UButton>
          </div>

          <p v-if="!cmDraft.length || !cmChannels" class="text-sm text-dimmed italic py-2">Aucune sortie / flux sans canaux.</p>

          <div v-else class="overflow-auto max-h-[62vh]">
            <table class="border-separate" style="border-spacing: 4px">
              <thead>
                <tr>
                  <th class="w-8 h-8 text-dimmed">
                    <UIcon name="i-lucide-x" class="size-4" />
                  </th>
                  <th v-for="(src, o) in cmDraft" :key="o" class="align-bottom">
                    <div class="flex flex-col items-center gap-0.5">
                      <span class="text-[11px] font-mono text-dimmed">{{ o }}</span>
                      <UButton icon="i-lucide-x" size="2xs" color="error" variant="ghost" :padded="false" class="p-0.5" @click="removeOutput(o)" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in cmChannels" :key="s">
                  <td class="text-[11px] font-mono text-dimmed text-right pr-1 w-8">{{ s - 1 }}</td>
                  <td v-for="(src, o) in cmDraft" :key="o" class="p-0">
                    <button
                      class="w-8 h-8 rounded-md border border-default/60 transition-colors"
                      :class="cmDraft[o] === (s - 1)
                        ? 'bg-primary hover:bg-primary/90'
                        : 'bg-error/15 hover:bg-error/30'"
                      :title="`Sortie ${o} ← Source ${s - 1}`"
                      @click="setOutput(o, s - 1)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex items-center justify-between border-t border-default pt-3">
            <span class="text-xs text-dimmed font-mono">[{{ cmDraft.join(', ') }}]</span>
            <UButton label="Fermer" color="neutral" variant="soft" @click="cmOpen = false" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
