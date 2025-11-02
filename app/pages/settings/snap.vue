<script setup lang="ts">
/* =======================
   Types
======================= */
type SnapStream = {
  id: string
  name: string
  type: string // 'pipe' | 'file' | 'alsa' | 'http' | 'pulse' | ...
  uri: string
  codec?: string | null
  sampleRate?: number | null
  channels?: number | null
  bitrate?: number | null
  startMuted?: boolean
  initialVolume?: number | null
}

type SnapClient = {
  id: string
  name?: string
  volume?: number // 0..100
  latencyMs?: number
  muted?: boolean
}

type SnapGroup = {
  id: string
  name?: string
  streamId?: string
  clients: SnapClient[]
}

type SnapServerCfg = {
  host: string
  port: number
  autostart: boolean
  autoreconnect: boolean
  bufferMs?: number
  resyncThresholdMs?: number
  qosNiceness?: number | null
}

type SnapConfig = {
  enabled: boolean
  server: SnapServerCfg
  streams: SnapStream[]
  groups: SnapGroup[]

  // meta
  last_applied_at?: string | null
  last_status?: 'ok' | 'error' | null
  last_msg?: string | null
}

/* =======================
   Constantes / options UI
======================= */
const STORAGE_KEY = 'snapcast_config_v1'

const streamTypeOptions = [
  { label: 'pipe', value: 'pipe' },
  { label: 'file', value: 'file' },
  { label: 'http', value: 'http' },
  { label: 'alsa', value: 'alsa' },
  { label: 'pulse', value: 'pulse' }
]

const codecOptions = [
  { label: 'auto', value: '' },
  { label: 'flac', value: 'flac' },
  { label: 'ogg', value: 'ogg' },
  { label: 'opus', value: 'opus' },
  { label: 'aac', value: 'aac' },
  { label: 'mp3', value: 'mp3' },
]

/* =======================
   State
======================= */
const cfg = reactive<SnapConfig>(loadFromStorage() ?? defaultCfg())

const errorMsg = ref<string | null>(null)
const okMsg = ref<string | null>(null)

const applying = ref(false)
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const actionBusy = ref<string | null>(null)

const savedSnapshot = ref(JSON.stringify(cfg))
const canSave = computed(() => JSON.stringify(cfg) !== savedSnapshot.value)

/* =======================
   Defaults / Storage
======================= */
function defaultCfg(): SnapConfig {
  return {
    enabled: true,
    server: {
      host: '127.0.0.1',
      port: 1780,
      autostart: true,
      autoreconnect: true,
      bufferMs: 2000,
      resyncThresholdMs: 200,
      qosNiceness: 0
    },
    streams: [
      {
        id: 'main',
        name: 'Flux principal',
        type: 'pipe',
        uri: '/tmp/snapfifo',
        codec: '',
        sampleRate: 44100,
        channels: 2,
        bitrate: null,
        startMuted: false,
        initialVolume: 80
      }
    ],
    groups: [
      {
        id: 'home',
        name: 'Maison',
        streamId: 'main',
        clients: [
          { id: 'living', name: 'Salon', volume: 80, latencyMs: 0, muted: false }
        ]
      }
    ],
    last_applied_at: null,
    last_status: null,
    last_msg: null
  }
}

function loadFromStorage(): SnapConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function saveToStorage() {
  saving.value = true
  errorMsg.value = null
  okMsg.value = null
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg, null, 2))
    savedSnapshot.value = JSON.stringify(cfg)
    okMsg.value = 'Configuration enregistrée localement.'
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Échec d’enregistrement.'
  } finally {
    saving.value = false
  }
}

function resetDefaults() {
  if (!confirm('Réinitialiser la configuration Snapcast aux valeurs par défaut ?')) return
  const d = defaultCfg()
  Object.assign(cfg, d)
  okMsg.value = 'Configuration réinitialisée.'
}

/* =======================
   Import / Export
======================= */
function triggerImport() {
  fileInput.value?.click()
}

async function onImportFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const json = JSON.parse(text)
    if (!isValidConfig(json)) throw new Error('Fichier invalide.')
    Object.assign(cfg, json)
    okMsg.value = 'Configuration importée.'
    input.value = ''
  } catch (err: any) {
    errorMsg.value = err?.message ?? 'Impossible d’importer ce fichier.'
  }
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'snapcast-config.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isValidConfig(x: any): x is SnapConfig {
  return !!x && typeof x === 'object' && 'server' in x && 'streams' in x && 'groups' in x
}

/* =======================
   Simuler Apply
======================= */
async function simulateApply(ok: boolean) {
  applying.value = true
  errorMsg.value = null
  okMsg.value = null
  try {
    await new Promise(r => setTimeout(r, 500))
    cfg.last_applied_at = new Date().toISOString()
    cfg.last_status = ok ? 'ok' : 'error'
    cfg.last_msg = ok ? 'Appliquée localement (simulation).' : 'Erreur simulée lors de l’application.'
    ok && (okMsg.value = 'Simulation OK.')
    !ok && (errorMsg.value = 'Simulation erreur.')
  } finally {
    applying.value = false
  }
}

/* =======================
   CRUD Streams / Groups / Clients
======================= */
function addStream() {
  const id = uniqueId('stream')
  cfg.streams.push({
    id,
    name: 'Nouveau flux',
    type: 'pipe',
    uri: '/tmp/snapfifo',
    codec: '',
    sampleRate: 44100,
    channels: 2,
    bitrate: null,
    startMuted: false,
    initialVolume: 80
  })
}

function removeStream(id: string) {
  cfg.streams = cfg.streams.filter(s => s.id !== id)
  cfg.groups.forEach(g => { if (g.streamId === id) g.streamId = undefined })
}

function addGroup() {
  const id = uniqueId('group')
  cfg.groups.push({
    id,
    name: 'Nouveau groupe',
    streamId: cfg.streams[0]?.id,
    clients: []
  })
}

function removeGroup(id: string) {
  cfg.groups = cfg.groups.filter(g => g.id !== id)
}

function addClient(g: SnapGroup) {
  const id = uniqueId('client')
  g.clients.push({ id, name: 'Nouveau client', volume: 80, latencyMs: 0, muted: false })
}

function removeClient(g: SnapGroup, clientId: string) {
  g.clients = g.clients.filter(c => c.id !== clientId)
}

function uniqueId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

/* =======================
   Validation
======================= */
const problems = computed(() => {
  const errs: string[] = []

  if (cfg.enabled) {
    if (!cfg.server.host) errs.push('Serveur: hôte manquant.')
    if (!(cfg.server.port >= 1 && cfg.server.port <= 65535)) errs.push('Serveur: port invalide.')
  }

  // streams
  const streamIds = new Set<string>()
  for (const s of cfg.streams) {
    if (!s.id) errs.push('Flux: un ID est vide.')
    if (streamIds.has(s.id)) errs.push(`Flux: ID dupliqué "${s.id}".`)
    streamIds.add(s.id)
    if (!s.type) errs.push(`Flux ${s.id}: type manquant.`)
    if (!s.uri) errs.push(`Flux ${s.id}: URI manquant.`)
    if (s.sampleRate && s.sampleRate < 8000) errs.push(`Flux ${s.id}: sampleRate trop bas.`)
    if (s.channels && (s.channels < 1 || s.channels > 8)) errs.push(`Flux ${s.id}: canaux hors plage.`)
    if (s.initialVolume && (s.initialVolume < 0 || s.initialVolume > 100)) errs.push(`Flux ${s.id}: volume initial invalide.`)
  }

  // groups
  const groupIds = new Set<string>()
  const allClientIds = new Set<string>()
  for (const g of cfg.groups) {
    if (!g.id) errs.push('Groupe: un ID est vide.')
    if (groupIds.has(g.id)) errs.push(`Groupe: ID dupliqué "${g.id}".`)
    groupIds.add(g.id)
    if (g.streamId && !streamIds.has(g.streamId)) errs.push(`Groupe ${g.id}: stream "${g.streamId}" introuvable.`)

    for (const c of g.clients) {
      if (!c.id) errs.push(`Groupe ${g.id}: un client a un ID vide.`)
      const fq = `${g.id}:${c.id}`
      if (allClientIds.has(fq)) errs.push(`Client dupliqué "${c.id}" dans groupe ${g.id}.`)
      allClientIds.add(fq)
      if (c.volume != null && (c.volume < 0 || c.volume > 100)) errs.push(`Client ${c.id}: volume invalide.`)
      if (c.latencyMs != null && c.latencyMs < 0) errs.push(`Client ${c.id}: latence négative.`)
    }
  }

  return errs
})
</script>

<template>
  <!-- 100% vertical + scroll -->
  <div class="min-h-screen flex flex-colh-full">
    <!-- Barre d’actions sticky en haut (Haut/Bas) -->
    <div class="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-default">
      <UPageCard
        title="Snapcast"
        description="Configuration locale du serveur, des flux et des groupes/clients."
        variant="naked"
        orientation="horizontal"
        class="mb-0"
      >
        <div class="flex items-center gap-2 w-full lg:w-auto lg:ms-auto">
          <UButton color="neutral" icon="i-lucide-rotate-ccw" @click="resetDefaults">Réinitialiser</UButton>
          <UButton color="neutral" icon="i-lucide-upload" @click="triggerImport">Importer</UButton>
          <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="onImportFileChange" />
          <UButton color="neutral" icon="i-lucide-download" @click="exportConfig">Exporter</UButton>
          <UButton :disabled="!canSave" :loading="saving" color="primary" icon="i-lucide-save" @click="saveToStorage">
            Enregistrer
          </UButton>
        </div>
      </UPageCard>
    </div>

    <!-- Contenu scrollable (tout en colonne) -->
    <div class="px-4 py-6 space-y-6">
      <UAlert v-if="errorMsg" color="red" :title="errorMsg" />
      <UAlert v-if="okMsg" color="green" :title="okMsg" />

      <!-- État -->
      <UPageCard
        title="État"
        :description="cfg.last_applied_at ? ('Dernière application : ' + new Date(cfg.last_applied_at).toLocaleString()) : 'Jamais appliquée'"
        variant="subtle"
      >
        <div class="space-y-3">
          <div>
            <div class="text-dimmed text-sm">Statut</div>
            <div class="font-medium">
              <template v-if="cfg.last_status==='ok'">OK</template>
              <template v-else-if="cfg.last_status==='error'">Erreur</template>
              <template v-else>—</template>
            </div>
            <div v-if="cfg.last_msg" class="mt-1 text-xs text-dimmed truncate max-w-[50ch]">
              {{ cfg.last_msg }}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton :loading="applying" icon="i-lucide-play-circle" @click="simulateApply(true)">Simuler OK</UButton>
            <UButton :loading="applying" color="red" icon="i-lucide-octagon-alert" @click="simulateApply(false)">Simuler erreur</UButton>
          </div>
        </div>
      </UPageCard>

      <!-- Serveur (UNE COLONNE) -->
      <UPageCard title="Serveur" description="Réglages généraux du Snapserver." variant="subtle">
        <div class="space-y-4">
          <div>
            <label class="text-sm text-dimmed">Hôte</label>
            <UInput v-model="(cfg.server.host)" placeholder="127.0.0.1" class="mt-2" />
          </div>
          <div>
            <label class="text-sm text-dimmed">Port JSON-RPC</label>
            <UInput v-model.number="(cfg.server.port)" type="number" min="1" max="65535" placeholder="1780" class="mt-2" />
          </div>
          <div class="flex items-center gap-3">
            <USwitch v-model="(cfg.server.autostart)" />
            <span class="text-sm">Autostart</span>
          </div>
          <div class="flex items-center gap-3">
            <USwitch v-model="(cfg.server.autoreconnect)" />
            <span class="text-sm">Auto-reconnect</span>
          </div>
          <div>
            <label class="text-sm text-dimmed">Buffer (ms)</label>
            <UInput v-model.number="(cfg.server.bufferMs)" type="number" min="100" step="50" class="mt-2" />
          </div>
          <div>
            <label class="text-sm text-dimmed">Seuil resync (ms)</label>
            <UInput v-model.number="(cfg.server.resyncThresholdMs)" type="number" min="0" step="10" class="mt-2" />
          </div>
          <div>
            <label class="text-sm text-dimmed">QoS / Niceness (hint)</label>
            <UInput v-model.number="(cfg.server.qosNiceness)" type="number" min="-20" max="19" placeholder="(optionnel)" class="mt-2" />
          </div>

          <div class="flex items-center justify-between pt-2">
            <div class="flex items-center gap-2">
              <USwitch v-model="(cfg.enabled)" />
              <span class="text-sm">Activer la config Snapcast</span>
            </div>
            <UBadge v-if="problems.length" color="red" variant="subtle">{{ problems.length }} problème(s)</UBadge>
          </div>
        </div>
      </UPageCard>

      <!-- Streams (UNE COLONNE) -->
      <UPageCard title="Flux (Streams)" description="Définis les sources audio servies par Snapserver." variant="subtle">
        <div class="space-y-4">
          <div v-for="s in cfg.streams" :key="s.id" class="rounded border border-default p-3 space-y-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-waveform" />
              <UInput v-model="(s.name)" placeholder="Nom du flux" class="flex-1" />
              <UButton color="red" variant="ghost" icon="i-lucide-trash-2" @click="removeStream(s.id)" />
            </div>

            <div>
              <label class="text-sm text-dimmed">ID</label>
              <UInput v-model="(s.id)" placeholder="main" class="mt-2" />
            </div>
            <div>
              <label class="text-sm text-dimmed">Type</label>
              <USelectMenu v-model="(s.type)" :options="streamTypeOptions" class="mt-2" />
            </div>
            <div>
              <label class="text-sm text-dimmed">Codec</label>
              <USelectMenu v-model="(s.codec)" :options="codecOptions" placeholder="auto" class="mt-2" />
            </div>

            <div>
              <label class="text-sm text-dimmed">URI / Chemin</label>
              <UInput v-model="(s.uri)" placeholder="/tmp/snapfifo | http://..." class="mt-2" />
            </div>

            <div>
              <label class="text-sm text-dimmed">Sample rate</label>
              <UInput v-model.number="(s.sampleRate)" type="number" min="8000" step="1000" placeholder="44100" class="mt-2" />
            </div>
            <div>
              <label class="text-sm text-dimmed">Canaux</label>
              <UInput v-model.number="(s.channels)" type="number" min="1" max="8" step="1" placeholder="2" class="mt-2" />
            </div>
            <div>
              <label class="text-sm text-dimmed">Bitrate</label>
              <UInput v-model.number="(s.bitrate)" type="number" min="32" step="16" placeholder="(optionnel)" class="mt-2" />
            </div>

            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <USwitch v-model="(s.startMuted)" />
                <span class="text-sm">Démarrer muet</span>
              </div>
              <div class="w-40">
                <label class="text-sm text-dimmed">Volume initial</label>
                <UInput v-model.number="(s.initialVolume)" type="number" min="0" max="100" placeholder="80" class="mt-2" />
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <UButton icon="i-lucide-plus" @click="addStream">Ajouter un flux</UButton>
          </div>
        </div>
      </UPageCard>

      <!-- Groups & Clients (UNE COLONNE) -->
      <UPageCard title="Groupes & Clients" description="Assigne un flux à chaque groupe et règle volume/latence des clients." variant="subtle">
        <div class="space-y-4">
          <div v-for="g in cfg.groups" :key="g.id" class="rounded border border-default p-3 space-y-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-users" />
              <UInput v-model="(g.name)" placeholder="Nom du groupe" class="flex-1" />
              <UButton color="red" variant="ghost" icon="i-lucide-trash-2" @click="removeGroup(g.id)" />
            </div>

            <div>
              <label class="text-sm text-dimmed">ID</label>
              <UInput v-model="(g.id)" placeholder="home" class="mt-2" />
            </div>
            <div>
              <label class="text-sm text-dimmed">Flux associé</label>
              <USelectMenu
                v-model="(g.streamId)"
                :options="cfg.streams.map(s => ({ label: `${s.name} (${s.id})`, value: s.id }))"
                placeholder="(aucun)"
                class="mt-2"
              />
            </div>

            <div class="space-y-2">
              <div
                v-for="c in g.clients"
                :key="c.id"
                class="rounded border border-default/50 p-2 space-y-2"
              >
                <UInput v-model="(c.id)" placeholder="client id (mac/host)" />
                <UInput v-model="(c.name)" placeholder="Nom affiché" />
                <UInput v-model.number="(c.volume)" type="number" min="0" max="100" placeholder="80" />
                <UInput v-model.number="(c.latencyMs)" type="number" min="0" step="10" placeholder="latence (ms)" />
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <USwitch v-model="(c.muted)" />
                    <span class="text-sm">Mute</span>
                  </div>
                  <UButton color="red" variant="ghost" icon="i-lucide-x" @click="removeClient(g, c.id)" />
                </div>
              </div>

              <div class="flex justify-end">
                <UButton icon="i-lucide-plus" variant="soft" @click="addClient(g)">Ajouter un client</UButton>
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <UButton icon="i-lucide-plus" @click="addGroup">Ajouter un groupe</UButton>
          </div>
        </div>
      </UPageCard>

      <!-- Validation -->
      <UPageCard title="Validation" variant="subtle">
        <div v-if="problems.length" class="space-y-1">
          <div v-for="(p,i) in problems" :key="i" class="text-red-400 text-sm">• {{ p }}</div>
        </div>
        <div v-else class="text-green-400 text-sm">Aucun problème détecté.</div>
      </UPageCard>
    </div>
  </div>
</template>

<style scoped>
/* tout est déjà vertical; le scroll est sur la zone .flex-1 */
</style>
