<!-- /pages/snap.vue -->
<script setup lang="ts">
/** ========= Types ========= */
type SnapVolume = { muted: boolean; percent: number }
type HostInfo = { arch?: string; ip: string; mac: string; name: string; os?: string }
type SnapClient = {
  id: string
  connected: boolean
  host: HostInfo
  config?: { volume?: SnapVolume, latency?: number, name?: string }
  group_id?: string
}
type SnapGroup = {
  id: string
  name?: string
  muted?: boolean
  stream_id?: string
  clients: SnapClient[]
}
type SnapStream = { id: string; uri?: { raw?: string } }

/** ========= Config ========= */
const SNAP_GUI_WS = 'ws://192.168.4.207:8099/Snap' // proxy Node GUI
const DEBUG = false

/** ========= State ========= */
const ws = ref<WebSocket | null>(null)
const connected = ref(false)

const groups = ref<SnapGroup[]>([])
const clients = ref<SnapClient[]>([])
const streams = ref<SnapStream[]>([])

const toast = useToast()
const log = (...a:any[]) => { if (DEBUG) console.log('[snap]', ...a) }
const ok  = (m:string)=> toast.add({ title:m, color:'green' })
const err = (m:string)=> toast.add({ title:m, color:'red' })
const info= (m:string)=> toast.add({ title:m, color:'neutral' })

function getFirstClient(g: SnapGroup): SnapClient | null {
  if (!g?.clients?.length) return null
  return g.clients[0]
}
function alive(b: boolean) { return b ? 'En ligne' : 'Hors ligne' }

/** ========= JSON-RPC client (id + pending) ========= */
let rpcId = 1
const pending = new Map<number, (msg:any)=>void>()

function send(payload:any) {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
  ws.value.send(JSON.stringify(payload))
}
function sendRpc(method: string, params?: any) {
  const id = rpcId++
  return new Promise<any>((resolve) => {
    pending.set(id, resolve)
    send({ jsonrpc: '2.0', id, method, params })
  })
}

/** ========= WebSocket ========= */
function connectSnap() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) return
  const sock = new WebSocket(SNAP_GUI_WS)
  ws.value = sock

  sock.addEventListener('open', () => {
    connected.value = true
    ok('Connecté au Snapserver')
    send({ method:'Server.GetStatusLocal' })
  })
  sock.addEventListener('close', () => {
    connected.value = false
    info('Déconnecté')
  })
  sock.addEventListener('error', () => {
    err('Erreur WebSocket')
  })
  sock.addEventListener('message', (ev) => {
    let msg:any
    try { msg = JSON.parse(ev.data) } catch { return }

    // Réponse à un RPC (id numérique) -> resolve la promesse
    if (typeof msg?.id === 'number' && pending.has(msg.id)) {
      pending.get(msg.id)!(msg)
      pending.delete(msg.id)
      return
    }

    // Sync complet renvoyé par le proxy Node
    if (msg?.id === 'Server.GetStatusLocal') {
      if (Array.isArray(msg.group))   groups.value  = msg.group
      if (Array.isArray(msg.client))  clients.value = msg.client
      if (Array.isArray(msg.streams)) streams.value = msg.streams
      log('sync', { groups: groups.value.length, clients: clients.value.length, streams: streams.value.length })
      return
    }

    // Notifs normalisées par ton serveur
    if (msg?.method === 'Client.OnVolumeChanged' && msg.params) {
      const cid = String(msg.params.id).toLowerCase()
      const vol = msg.params.volume as SnapVolume
      const c = clients.value.find(c => c.id.toLowerCase() === cid)
      if (c) c.config = { ...c.config, volume: vol }
      for (const g of groups.value) {
        const gc = g.clients?.find(x => x.id.toLowerCase() === cid)
        if (gc) gc.config = { ...gc.config, volume: vol }
      }
      return
    }
    if (msg?.method === 'Group.OnStreamChanged' && msg.params) {
      const gid = String(msg.params.id).toLowerCase()
      const st  = String(msg.params.stream_id || '')
      const g = groups.value.find(x => x.id.toLowerCase() === gid)
      if (g) g.stream_id = st
      return
    }
  })
}
function disconnectSnap() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) ws.value.close(1000, 'manual')
  ws.value = null
  connected.value = false
}
function refresh() {
  send({ method:'Server.GetStatusLocal' })
}

/** ========= Commands (helpers RPC) ========= */
async function rpcClientSetGroup(clientId: string, groupId: string) {
  return sendRpc('Client.SetGroup', { id: clientId, group: groupId })
}
async function rpcGroupSetName(groupId: string, name: string) {
  return sendRpc('Group.SetName', { id: groupId, name })
}
async function rpcGroupSetStream(groupId: string, streamId: string) {
  return sendRpc('Group.SetStream', { id: groupId, stream_id: streamId })
}

async function setClientVolume(clientId: string, percent: number) {
  const r = await sendRpc('Client.SetVolume', { id: clientId, volume: { muted: false, percent } })
  if (r?.error) err(r.error?.message || 'Client.SetVolume a échoué')
}
async function toggleMute(clientId: string, v: SnapVolume | undefined) {
  const muted = !!v?.muted
  const percent = Number(v?.percent ?? 0)
  const r = await sendRpc('Client.SetVolume', { id: clientId, volume: { muted: !muted, percent } })
  if (r?.error) err(r.error?.message || 'Mute a échoué')
}
async function setGroupStream(groupId: string, streamId: string) {
  // On envoie tel quel (Snapserver peut l’accepter même si tous les clients sont off)
  const r = await rpcGroupSetStream(groupId, streamId)
  if (r?.error) err(r.error?.message || 'Group.SetStream a échoué')
  else ok('Flux du groupe mis à jour')
}

/** ========= Create Group (multi-clients) ========= */
const showCreate = ref(false)
const creating = ref(false)
const newGroupName = ref('')
const newGroupStream = ref<string>('')
const newGroupClientIds = ref<string[]>([]) // multi

const streamOptions = computed(() =>
  streams.value.map(s => ({ label: s.id, value: s.id, description: s.uri?.raw || '' }))
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

async function submitCreate () {
  if (creating.value) return
  if (!newGroupName.value.trim()) { err('Nom requis'); return }
  if (!newGroupStream.value)      { err('Sélectionne un flux'); return }

  // Au moins 1 client connecté nécessaire pour matérialiser un nouveau groupe sur Snapserver
  if (!connectedClients.value.length) {
    err('Aucun client connecté : impossible de créer un groupe côté Snapserver.')
    return
  }
  if (!newGroupClientIds.value.length) {
    err('Sélectionne au moins un client connecté.')
    return
  }

  creating.value = true
  const newId = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))

  try {
    // Optimiste local (apparition immédiate)
    groups.value.unshift({ id: newId, name: newGroupName.value, stream_id: newGroupStream.value, clients: [] })

    // 1) Premier client -> crée le groupe côté Snap
    const [first, ...rest] = newGroupClientIds.value
    const r1 = await rpcClientSetGroup(first, newId)
    if (r1?.error) throw new Error(r1.error?.message || 'Client.SetGroup (1er) a échoué')

    // 2) Nom
    const r2 = await rpcGroupSetName(newId, newGroupName.value)
    if (r2?.error) throw new Error(r2.error?.message || 'Group.SetName a échoué')

    // 3) Flux
    const r3 = await rpcGroupSetStream(newId, newGroupStream.value)
    if (r3?.error) throw new Error(r3.error?.message || 'Group.SetStream a échoué')

    // 4) Autres clients
    for (const cid of rest) {
      const r = await rpcClientSetGroup(cid, newId)
      if (r?.error) throw new Error(r.error?.message || `Client.SetGroup a échoué pour ${cid}`)
    }

    ok('Groupe créé et configuré')
    showCreate.value = false
    refresh()
  } catch (e:any) {
    err(`Création échouée: ${e?.message || e}`)
    // rollback visuel
    groups.value = groups.value.filter(g => g.id !== newId)
  } finally {
    creating.value = false
  }
}

/** ========= Lifecycle ========= */
onMounted(connectSnap)
onUnmounted(disconnectSnap)

/** ========= UI helpers ========= */
const hasAnyData = computed(() => groups.value.length || streams.value.length)
</script>

<template>
  <!-- Page autonome : header sticky + main scrollable -->
  <div class="flex flex-col min-h-0 flex-1">
    <!-- Header sticky -->
    <header class="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-default">
      <UPageCard
        title="Snapcast"
        :description="`État: ${connected ? 'connecté' : 'déconnecté'} • Groupes: ${groups.length} • Flux: ${streams.length}`"
        variant="naked"
        orientation="horizontal"
        :ui="{ container: 'p-4 sm:p-4 gap-3' }"
        class="mb-0"
      >
        <div class="flex items-center gap-2 w-full lg:w-auto lg:ms-auto">
          <UButton
            :color="connected ? 'green' : 'red'"
            :icon="connected ? 'i-lucide-link-2' : 'i-lucide-link-2-off'"
            @click="connected ? disconnectSnap() : connectSnap()"
          >
            {{ connected ? 'Connecté' : 'Déconnecté' }}
          </UButton>
          <UButton color="neutral" icon="i-lucide-refresh-ccw" @click="refresh">
            Rafraîchir
          </UButton>
          <UButton color="primary" icon="i-lucide-plus" @click="openCreate">
            Nouveau groupe
          </UButton>
        </div>
      </UPageCard>
    </header>

    <!-- Main scrollable -->
    <main class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8">
      <div class="w-full lg:max-w-12xl py-6 sm:py-8 lg:py-12">
        <!-- Empty -->
        <UCard v-if="!hasAnyData" class="border-dashed">
          <UEmpty
            icon="i-lucide-database"
            title="Aucune donnée"
            description="Aucun groupe/flux reçu. Connecte-toi puis rafraîchis l’état."
          >
            <template #actions>
              <div class="flex gap-2">
                <UButton @click="connectSnap" icon="i-lucide-link-2">Se connecter</UButton>
                <UButton color="neutral" icon="i-lucide-refresh-ccw" @click="refresh">Rafraîchir</UButton>
                <UButton color="primary" icon="i-lucide-plus" @click="openCreate">Nouveau groupe</UButton>
              </div>
            </template>
          </UEmpty>
        </UCard>

        <!-- Groupes -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          <UCard v-for="g in groups" :key="g.id" class="flex flex-col">
            <div class="flex items-start gap-3">
              <div class="rounded-lg bg-elevated/50 p-2">
                <UIcon name="i-lucide-users" class="size-5" />
              </div>
              <div class="min-w-0">
                <div class="font-medium truncate">{{ g.name || g.id }}</div>
                <div class="text-xs text-dimmed">{{ g.clients?.length || 0 }} client(s)</div>
                <div v-if="getFirstClient(g)" class="mt-1 text-xs flex items-center gap-2">
                  <UBadge :color="getFirstClient(g)?.connected ? 'green' : 'red'" variant="subtle">
                    {{ alive(!!getFirstClient(g)?.connected) }}
                  </UBadge>
                  <UBadge variant="subtle" color="primary">{{ g.stream_id || '—' }}</UBadge>
                </div>
              </div>

              <div class="ms-auto flex items-center gap-1">
                <UButton size="xs" color="neutral" icon="i-lucide-rotate-ccw" variant="ghost" @click="refresh" />
                <UTooltip :text="g.clients?.length ? 'Réassigne d’abord les clients' : 'Supprimer localement'">
                  <UButton
                    size="xs" color="red" icon="i-lucide-trash-2" variant="ghost"
                    :disabled="!!g.clients?.length"
                    @click="groups = groups.filter(x => x.id !== g.id)"
                  />
                </UTooltip>
              </div>
            </div>

            <!-- Flux sous forme de pills (div) -->
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
                  @click="() => { if (g.stream_id !== opt.value) { g.stream_id = opt.value; setGroupStream(g.id, opt.value) } }"
                >
                  <div class="font-medium truncate">{{ opt.label }}</div>
                  <div v-if="opt.description" class="text-xs opacity-80 truncate max-w-[28ch]">
                    {{ opt.description }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Volume par client -->
            <div v-if="g.clients?.length" class="mt-4 space-y-3">
              <div
                v-for="c in g.clients"
                :key="c.id"
                class="rounded-md border border-default/60 p-2 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <div class="text-sm truncate">
                    {{ c.host?.name || c.id }} <span class="text-dimmed">· {{ c.host?.ip }}</span>
                  </div>
                  <UBadge :color="c.connected ? 'green':'red'" variant="subtle">{{ alive(c.connected) }}</UBadge>
                </div>

                <div v-if="c.connected" class="flex items-center justify-between">
                  <UBadge variant="subtle">{{ c.config?.volume?.percent ?? 0 }}%</UBadge>
                  <UButton
                    size="xs"
                    :color="c.config?.volume?.muted ? 'red' : 'neutral'"
                    :icon="c.config?.volume?.muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
                    @click="toggleMute(c.id, c.config?.volume)"
                  />
                </div>
                <input
                  type="range" min="0" max="100" :value="c.config?.volume?.percent" step="1"
                  class="w-full accent-current h-1.5 range-primary-0"
                  @input="setClientVolume(c.id, ($event.target as HTMLInputElement).valueAsNumber)"
                />
                <!-- <USlider
                  v-if="c.connected"
                  class="range-primary-0"
                  :min="0" :max="100" :step="1"
                  :model-value="c.config?.volume?.percent ?? 0"
                  @update:model-value="(v:number)=> setClientVolume(c.id, v)"
                /> -->
              </div>
            </div>
          </UCard>
        </div>

        <!-- Alerte si aucun client connecté (cas de ton payload) -->
        <UAlert
          v-if="connectedClients.length === 0"
          class="mt-6"
          color="amber"
          title="Aucun client connecté"
          description="La création d’un groupe nécessite au moins un client en ligne. Allume un client puis réessaie."
          variant="subtle"
        />
      </div>
    </main>

    <!-- Formulaire “inline” (pas de modal overlay) -->
    <UCard v-if="showCreate" :ui="{ body: 'space-y-4' }" class="max-w-lg mx-auto">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-plus" class="size-5" />
          <h3 class="font-semibold">Nouveau groupe</h3>
          <UButton class="ms-auto" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="showCreate=false" />
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
        <div v-if="!streams.length" class="text-xs text-dimmed mt-1">Aucun flux disponible</div>
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
            :class="newGroupClientIds.includes(c.id) ? 'border-primary ring-1 ring-primary' : 'border-default hover:bg-elevated/50'"
          >
            <input class="accent-primary" type="checkbox" :value="c.id" v-model="newGroupClientIds" />
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
          <UButton color="neutral" variant="ghost" @click="showCreate=false">Annuler</UButton>
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
  </div>
</template>
