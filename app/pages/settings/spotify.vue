<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useToast } from '#imports'
import http from '@/src/lib/https' // quand tu brancheras l’API

// ================== TYPES ==================

// 1) Instances Spotify = "user", genre comptes / daemons Spotifyd connectés
// ← tu complèteras les champs quand tu me diras ce que tu exposes côté backend
type SpotifyInstanceUser = {
  id: string
  username: string// ex "family-premium"
  status: 'online' | 'offline' | 'error'
  autostart?: boolean
  host?: string
  port?: number
}

// 2) Lecteurs Spotify = tes sorties audio réelles (Multiroom, Cuisine, ...)
type SpotifyOutputFifo = {
  'path-audio': string    // /tmp/spotify/multiroom_Snap.fifo
  channels: number        // 2, 8, ...
  rate: number            // 48000
}

type SpotifyPlayerConfig = {
  name: string                            // "Multiroom", "Cuisine"
  backend: string                         // "pipe"
  bitrate: string                         // "320"
  'enable-volume-normalisation': string   // "false" (string dans tes data)
  'initial-volume': string                // "85"
  'device-type': string                   // "avr"
  'path-audio': string                    // "/tmp/"
  typeStream: string                      // "StreamOutFifo"
  frames_per_buffer: number               // 2048
  StreamOutFifo: SpotifyOutputFifo
  // NOTE: tu as mentionné "sendVban" / "localStream" possibles → on peut les ajouter après
}

// ================== STATE (mock pour l’UI) ==================

// Instances Spotify ("user")
const instances = ref<SpotifyInstanceUser[]>([
  {
    id: 'user-1',
    username: 'family-premium',
    status: 'online',
    autostart: true,
    host: '192.168.4.45',
    port: 4001
  },
  {
    id: 'user-2',
    username: 'guest-room',
    status: 'offline',
    autostart: false,
    host: '192.168.4.181',
    port: 4001
  }
])

// Lecteurs Spotify (ta structure fournie)
const players = ref<SpotifyPlayerConfig[]>([])

// UI state
const toast = useToast?.()
const loadingInstances = ref(false)
const loadingPlayers = ref(false)

// recherche côté "Lecteurs Spotify"
const q = ref('')

const filteredPlayers = computed(() => {
  if (!q.value.trim()) return players.value
  const rex = new RegExp(q.value.trim(), 'i')
  return players.value.filter(p =>
    rex.test(p.name) ||
    rex.test(p.backend) ||
    rex.test(p['device-type']) ||
    rex.test(p.typeStream) ||
    rex.test(p.StreamOutFifo['path-audio'])
  )
})

// ================== ACTIONS INSTANCES ==================

function addInstance() {
  instances.value.push({
    id: `user-${Date.now()}`,
    username: 'nouvel-compte',
    status: 'offline',
    autostart: false,
    host: '192.168.x.x',
    port: 4001
  })
  toast?.add?.({
    title: 'Instance Spotify ajoutée (local)',
    color: 'green'
  })
}

function toggleAutostart(inst: SpotifyInstanceUser) {
  inst.autostart = !inst.autostart
  // TODO backend: POST /spotify/instance/:id/autostart {autostart}
}

function startInstance(inst: SpotifyInstanceUser) {
  inst.status = 'online'
  // TODO backend: POST /spotify/instance/:id/start
  toast?.add?.({
    title: `Instance ${inst.username} démarrée`,
    color: 'green'
  })
}

function stopInstance(inst: SpotifyInstanceUser) {
  inst.status = 'offline'
  // TODO backend: POST /spotify/instance/:id/stop
  toast?.add?.({
    title: `Instance ${inst.username} arrêtée`,
    color: 'yellow'
  })
}

function removeInstance(instId: string) {
  instances.value = instances.value.filter(i => i.id !== instId)
  // TODO backend: DELETE /spotify/instance/:id
  toast?.add?.({
    title: `Instance supprimée`,
    color: 'red'
  })
}

// ================== ACTIONS LECTEURS ==================

// Edition locale des champs techniques :
function updateBitrate(p: SpotifyPlayerConfig, newVal: string) {
  p.bitrate = newVal
  // TODO backend: POST /spotify/player/:name/bitrate
}
function rename(p: SpotifyPlayerConfig, name: string) {
  p.name = name
}

function updateInitialVolume(p: SpotifyPlayerConfig, vol: string) {
  // tu le stockes comme string ("85"), je respecte ton format
  p['initial-volume'] = vol
  // TODO backend: POST /spotify/player/:name/volumeInit
}

function updateFifoPath(p: SpotifyPlayerConfig, newPath: string) {
  p.StreamOutFifo['path-audio'] = newPath
  // TODO backend: POST /spotify/player/:name/fifoPath
}

function updateChannels(p: SpotifyPlayerConfig, ch: number) {
  p.StreamOutFifo.channels = ch
  // TODO backend
}

function updateRate(p: SpotifyPlayerConfig, rate: number) {
  p.StreamOutFifo.rate = rate
  // TODO backend
}

function removePlayer(name: string) {
  http.delete('/spotifyConf', { data: { name } }).then((data) => {
    console.log(data)
  })
  players.value = players.value.filter(pl => pl.name !== name)
  // TODO backend: DELETE /spotify/player/:name
  toast?.add?.({
    title: `Lecteur supprimé`,
    color: 'error'
  })
}
function modifier(name: string) {
  // TODO ouvrir un modal d'édition complète
  toast?.add?.({
    title: `Édition du lecteur ${name} (non implémenté)`,
    color: 'success'
  })
}
function ajouter(lec: object) {
  http.post('/spotifyConf', { data: lec }).then((data) => {
    console.log(data)
  })
  toast?.add?.({
    title: `Ajout de lecteur (non implémenté)`,
    color: 'success'
  })
}

function addPlayer() {
  players.value.push({
    name: 'Nouveau lecteur',
    backend: 'pipe',
    bitrate: '320',
    'enable-volume-normalisation': 'false',
    'initial-volume': '80',
    'device-type': 'avr',
    'path-audio': '/tmp/',
    typeStream: 'StreamOutFifo',
    frames_per_buffer: 2048,
    StreamOutFifo: {
      'path-audio': '/tmp/spotify/new_Snap.fifo',
      channels: 2,
      rate: 48000
    }
  })
  toast?.add?.({
    title: 'Lecteur ajouté',
    color: 'green'
  })
}

// ================== LIFECYCLE ==================
onMounted(async () => {
  // TODO plus tard :
  // const instRes = await http.get('/spotify/instances')
  // instances.value = instRes.data.instances
  const playRes = await http.get('/spotifyConf')
  players.value = playRes.data
})
</script>

<template>
  <div class="flex flex-col gap-6 pb-12">
    <!-- HEADER GLOBAL -->
    <div class="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-default">
      <UPageCard
        title="Spotify"
        description="Instances Spotify (utilisateurs/services) et Lecteurs Spotify (sorties audio)."
        variant="naked"
        orientation="horizontal"
        class="mb-0"
      >
        <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:ms-auto">
          <UButton
            color="primary"
            icon="i-lucide-plus"
            @click="addInstance"
          >
            Nouvelle instance
          </UButton>

          <UButton
            variant="soft"
            color="neutral"
            icon="i-lucide-plus"
            @click="addPlayer"
          >
            Nouveau lecteur
          </UButton>
        </div>
      </UPageCard>
    </div>

    <!-- ============ INSTANCES SPOTIFY ("user") ============ -->
    <UPageCard
      title="Instances Spotify"
      description="Chaque instance = un service Spotify (compte, token, process)."
      variant="subtle"
    >
      <div v-if="loadingInstances" class="text-sm text-dimmed">
        Chargement…
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="inst in instances"
          :key="inst.id"
          class="rounded border border-default p-4 flex flex-col gap-4"
        >
          <!-- header instance -->
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex flex-col">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-user" class="text-lg" />
                <span class="font-medium text-base">
                  {{ inst.username }}
                </span>

                <UBadge
                  v-if="inst.status === 'online'"
                  color="green"
                  variant="subtle"
                >
                  En ligne
                </UBadge>
                <UBadge
                  v-else-if="inst.status === 'offline'"
                  color="red"
                  variant="subtle"
                >
                  Arrêtée
                </UBadge>
                <UBadge
                  v-else
                  color="yellow"
                  variant="subtle"
                >
                  Erreur
                </UBadge>
              </div>

              <div class="text-xs text-dimmed">
                {{ inst.host || '??' }}<span v-if="inst.port">:{{ inst.port }}</span>
              </div>

              <div class="flex items-center gap-2 text-xs text-dimmed">
                <USwitch
                  v-model="inst.autostart"
                  @click="toggleAutostart(inst)"
                />
                <span>Démarrage auto</span>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-lucide-play"
                size="xs"
                color="green"
                :disabled="inst.status === 'online'"
                @click="startInstance(inst)"
              >
                Start
              </UButton>
              <UButton
                icon="i-lucide-square"
                size="xs"
                color="red"
                :disabled="inst.status === 'offline'"
                @click="stopInstance(inst)"
              >
                Stop
              </UButton>
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                color="red"
                variant="ghost"
                @click="removeInstance(inst.id)"
              />
            </div>
          </div>

          <!-- mini-infos -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div class="text-dimmed">ID instance</div>
              <div class="font-mono break-all">{{ inst.id }}</div>
            </div>

            <div>
              <div class="text-dimmed">Machines / Ports</div>
              <div class="font-mono break-all">
                {{ inst.host || 'n/a' }}<span v-if="inst.port">:{{ inst.port }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UPageCard>

    <!-- ============ LECTEURS SPOTIFY (sorties audio) ============ -->
    <UPageCard
      title="Lecteurs Spotify"
      description="Chaque lecteur = une sortie audio vers Snap (fifo, channels, rate...)."
      variant="subtle"
    >
      <!-- header = recherche -->
      <template #header>
        <div class="flex flex-col w-full gap-3">
          <div class="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div class="flex-1">
              <UInput
                v-model="q"
                icon="i-lucide-search"
                placeholder="Rechercher un lecteur (nom, backend, fifo...)"
                class="w-full"
              />
            </div>
            <div class="text-xs text-dimmed sm:text-right">
              {{ filteredPlayers.length }} / {{ players.length }} lecteurs
            </div>
          </div>
          <UDivider />
        </div>
      </template>

      <div class="p-4 space-y-4">
        <div
          v-for="p in filteredPlayers"
          :key="p.name"
          class="rounded border border-default p-4 flex flex-col gap-4"
        >
          <!-- en-tête lecteur -->
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-volume2" />
                <span class="font-medium text-base">
                  {{ p.name }}
                </span>
                <UBadge color="neutral" variant="soft" class="text-[10px]">
                  {{ p['device-type'] }}
                </UBadge>
              </div>

              <div class="text-xs text-dimmed">
                backend: <span class="font-mono">{{ p.backend }}</span>
                · stream: <span class="font-mono">{{ p.typeStream }}</span>
              </div>

              <div class="text-[11px] text-dimmed leading-snug">
                normalisation:
                <span class="font-mono">{{ p['enable-volume-normalisation'] }}</span>,
                volume init:
                <span class="font-mono">{{ p['initial-volume'] }}%</span>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                color="red"
                variant="ghost"
                icon="i-lucide-plus"
                @click="ajouter(p)"
              />
              <UButton
                size="xs"
                color="red"
                variant="ghost"
                icon="i-lucide-pen"
                @click="modifier(p.name)"
              />
              <UButton
                size="xs"
                color="red"
                variant="ghost"
                icon="i-lucide-trash-2"
                @click="removePlayer(p.name)"
              />
            </div>
          </div>

          <!-- paramètres techniques -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <!-- Colonne gauche -->
            <div class="space-y-3">
              <div>
                <div class="text-xs text-dimmed">Name</div>
                <UInput
                  :model-value="p.name"
                  @input="(e:any)=>rename(p, e.target.value)"
                />
              </div>
              <div>
                <div class="text-xs text-dimmed">Bitrate (kbps)</div>
                <UInput
                  :model-value="p.bitrate"
                  @input="(e:any)=>updateBitrate(p, e.target.value)"
                />
              </div>
              <div>
                <div class="text-xs text-dimmed">Volume initial (%)</div>
                <UInput
                  type="number"
                  min="0"
                  max="100"
                  :model-value="p['initial-volume']"
                  @input="(e:any)=>updateInitialVolume(p, e.target.value)"
                />
              </div>

              <div>
                <div class="text-xs text-dimmed">Frames / buffer</div>
                <UInput
                  type="number"
                  min="128"
                  step="64"
                  v-model.number="p.frames_per_buffer"
                />
              </div>
            </div>

            <!-- Colonne droite -->
            <div class="space-y-3">
              <div>
                <div class="text-xs text-dimmed">FIFO path (sortie Snap)</div>
                <UInput
                  :model-value="p.StreamOutFifo['path-audio']"
                  placeholder="/tmp/spotify/xxx_Snap.fifo"
                  @input="(e:any)=>updateFifoPath(p, e.target.value)"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-xs text-dimmed">Channels</div>
                  <UInput
                    type="number"
                    min="1"
                    max="8"
                    :model-value="p.StreamOutFifo.channels"
                    @input="(e:any)=>updateChannels(p, Number(e.target.value))"
                  />
                </div>

                <div>
                  <div class="text-xs text-dimmed">Rate (Hz)</div>
                  <UInput
                    type="number"
                    min="8000"
                    step="1000"
                    :model-value="p.StreamOutFifo.rate"
                    @input="(e:any)=>updateRate(p, Number(e.target.value))"
                  />
                </div>
              </div>

              <div>
                <div class="text-xs text-dimmed">Base path-audio</div>
                <UInput
                  v-model="p['path-audio']"
                  placeholder="/tmp/"
                />
              </div>
            </div>
          </div>

          <!-- debug / vue brute -->
          <details class="text-[11px] text-dimmed">
            <summary class="cursor-pointer select-none text-xs text-dimmed">
              Détails bruts
            </summary>
            <pre class="mt-2 p-2 bg-default/20 rounded text-[10px] leading-tight overflow-x-auto">
{{ p }}
            </pre>
          </details>
        </div>

        <div
          v-if="!filteredPlayers.length && !loadingPlayers"
          class="text-sm text-dimmed italic"
        >
          Aucun lecteur ne correspond à "{{ q }}".
        </div>
      </div>
    </UPageCard>
  </div>
</template>
