<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import http from '@/src/lib/https'
import { useToast } from '#imports'

type BtAdapter = {
  name?: string
  alias?: string
  address?: string
  powered?: boolean
  discoverable?: boolean
  pairable?: boolean
  discovering?: boolean
  [key: string]: any
}

type BtDevice = {
  address?: string
  name?: string
  alias?: string
  paired?: boolean
  connected?: boolean
  trusted?: boolean
  rssi?: number
  uuids?: string[]
  battery?: number
  [key: string]: any
}

const toast = useToast?.()

/* ---------- state ---------- */
const loadingAdapters = ref(false)
const loadingDevices = ref(false)
const scanning = ref(false)
const actionLoading = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

const adapters = ref<BtAdapter[]>([])
const devices = ref<BtDevice[]>([])
const scanResults = ref<BtDevice[]>([])
const btStatus = ref<any>(null)

/* ---------- filters ---------- */
const q = ref('')
const pairedFilter = ref<'all' | 'paired' | 'not-paired'>('all')
const connectedFilter = ref<'all' | 'connected' | 'disconnected'>('all')

/* ---------- scan form ---------- */
const scanDurationMs = ref(8000)
const scanTransport = ref<'auto' | 'le' | 'bredr'>('auto')
const scanPattern = ref('')
const scanDuplicateData = ref(true)

/* ---------- helpers ---------- */
function getDeviceKey(d: BtDevice) {
  return d.address || d.name || Math.random().toString(36)
}

function boolBadgeColor(v: any) {
  return v ? 'primary' : 'neutral'
}

function safeLabel(d: BtDevice) {
  return d.name || d.alias || d.address || 'Unknown device'
}

function matchesFilters(d: BtDevice) {
  if (pairedFilter.value === 'paired' && !d.paired) return false
  if (pairedFilter.value === 'not-paired' && d.paired) return false

  if (connectedFilter.value === 'connected' && !d.connected) return false
  if (connectedFilter.value === 'disconnected' && d.connected) return false

  if (q.value.trim()) {
    const s = q.value.trim().toLowerCase()
    const hay = [
      d.name,
      d.alias,
      d.address,
      ...(Array.isArray(d.uuids) ? d.uuids : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (!hay.includes(s)) return false
  }

  return true
}

const filteredDevices = computed(() => devices.value.filter(matchesFilters))
const filteredScanResults = computed(() => scanResults.value.filter(matchesFilters))

/* ---------- api ---------- */
async function fetchAdapters() {
  try {
    loadingAdapters.value = true
    errorMsg.value = null

    const res = await http.get('/bt/adapters')
    adapters.value = res.data?.adapters || []

  } catch (e: any) {
    console.error(e)
    errorMsg.value = 'Impossible de charger les adaptateurs Bluetooth.'
    toast?.add?.({ title: 'Erreur', description: errorMsg.value, color: 'red' })
  } finally {
    loadingAdapters.value = false
  }
}

async function fetchDevices() {
  try {
    loadingDevices.value = true
    errorMsg.value = null

    const params: Record<string, any> = {}

    if (pairedFilter.value === 'paired') params.paired = true
    if (pairedFilter.value === 'not-paired') params.paired = false

    if (connectedFilter.value === 'connected') params.connected = true
    if (connectedFilter.value === 'disconnected') params.connected = false

    if (q.value.trim()) params.nameContains = q.value.trim()

    const res = await http.get('/bt/devices', { params })
    devices.value = res.data?.devices || []

  } catch (e: any) {
    console.error(e)
    errorMsg.value = 'Impossible de charger les devices Bluetooth.'
    toast?.add?.({ title: 'Erreur', description: errorMsg.value, color: 'red' })
  } finally {
    loadingDevices.value = false
  }
}

async function fetchStatus(target?: string) {
  try {
    const params = target ? { target } : {}
    const res = await http.get('/bt/status', { params })
    btStatus.value = res.data?.status ?? null
  } catch (e: any) {
    console.error(e)
  }
}

async function scanBt() {
  try {
    scanning.value = true
    errorMsg.value = null
    scanResults.value = []

    const res = await http.post('/bt/scan', {
      durationMs: scanDurationMs.value,
      transport: scanTransport.value,
      pattern: scanPattern.value,
      duplicateData: scanDuplicateData.value
    })

    scanResults.value = res.data?.devices || []
    toast?.add?.({
      title: 'Scan terminé',
      description: `${scanResults.value.length} device(s) trouvé(s)`,
      color: 'green'
    })

  } catch (e: any) {
    console.error(e)
    errorMsg.value = 'Scan Bluetooth impossible.'
    toast?.add?.({ title: 'Erreur scan', description: errorMsg.value, color: 'red' })
  } finally {
    scanning.value = false
  }
}

async function pairDevice(target?: string) {
  if (!target) return
  try {
    actionLoading.value = `pair:${target}`
    await http.post('/bt/pair', { target })
    toast?.add?.({ title: 'Pairing OK', description: target, color: 'green' })
    await Promise.all([fetchDevices(), fetchStatus(target)])
  } catch (e: any) {
    console.error(e)
    toast?.add?.({ title: 'Pairing impossible', description: target, color: 'red' })
  } finally {
    actionLoading.value = null
  }
}

async function connectDevice(target?: string) {
  if (!target) return
  try {
    actionLoading.value = `connect:${target}`
    await http.post('/bt/connect', { target, retries: 3 })
    toast?.add?.({ title: 'Connexion OK', description: target, color: 'green' })
    await Promise.all([fetchDevices(), fetchStatus(target)])
  } catch (e: any) {
    console.error(e)
    toast?.add?.({ title: 'Connexion impossible', description: target, color: 'red' })
  } finally {
    actionLoading.value = null
  }
}

async function disconnectDevice(target?: string) {
  if (!target) return
  try {
    actionLoading.value = `disconnect:${target}`
    await http.post('/bt/disconnect', { target })
    toast?.add?.({ title: 'Déconnexion OK', description: target, color: 'amber' })
    await Promise.all([fetchDevices(), fetchStatus(target)])
  } catch (e: any) {
    console.error(e)
    toast?.add?.({ title: 'Déconnexion impossible', description: target, color: 'red' })
  } finally {
    actionLoading.value = null
  }
}

async function removeDevice(target?: string) {
  if (!target) return
  if (!confirm(`Supprimer le device ${target} ?`)) return

  try {
    actionLoading.value = `remove:${target}`
    await http.delete('/bt/device', { data: { target } })
    toast?.add?.({ title: 'Device supprimé', description: target, color: 'green' })
    await Promise.all([fetchDevices(), fetchStatus()])
  } catch (e: any) {
    console.error(e)
    toast?.add?.({ title: 'Suppression impossible', description: target, color: 'red' })
  } finally {
    actionLoading.value = null
  }
}

async function refreshAll() {
  await Promise.all([
    fetchAdapters(),
    fetchDevices(),
    fetchStatus()
  ])
}

onMounted(async () => {
  await refreshAll()
})
</script>

<template>
  <div class="flex flex-col gap-6 pb-10 px-3 sm:px-4 lg:px-6">
    <!-- HEADER -->
    <div class="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 pt-4 pb-3">
      <UDashboardNavbar class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default" style="height: 80px;">
        <template #left>
          <UPageCard
            title="Bluetooth"
            description="Gestion des adaptateurs, scan, pairing, connexion et suppression."
            variant="naked"
            orientation="horizontal"
            class="mb-0"
          />
        </template>

        <template #right>
          <div class="flex flex-wrap gap-2 w-full lg:w-auto lg:ms-auto items-center">
            <div class="hidden sm:flex items-center gap-2 text-xs text-dimmed">
              <span>Adapters: {{ adapters.length }}</span>
              <span>· Devices: {{ devices.length }}</span>
              <span>· Scan: {{ scanResults.length }}</span>
            </div>

            <UButton
              icon="i-lucide-refresh-ccw"
              color="neutral"
              :loading="loadingAdapters || loadingDevices"
              @click="refreshAll"
            >
              Rafraîchir
            </UButton>

            <UButton
              icon="i-lucide-search"
              color="primary"
              :loading="scanning"
              @click="scanBt"
            >
              Scanner
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </div>

    <!-- ALERTES -->
    <UAlert v-if="errorMsg" color="red" :title="errorMsg" />

    <!-- BARRE SCAN -->
    <UPageCard
      variant="subtle"
      :ui="{ container: 'p-3 sm:p-4 gap-y-0', wrapper: 'items-stretch' }"
    >
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label class="text-xs text-dimmed block mb-1">Durée scan (ms)</label>
          <UInput v-model.number="scanDurationMs" type="number" />
        </div>

        <div>
          <label class="text-xs text-dimmed block mb-1">Transport</label>
          <USelect
            v-model="scanTransport"
            :items="[
              { label: 'Auto', value: 'auto' },
              { label: 'LE', value: 'le' },
              { label: 'BR/EDR', value: 'bredr' }
            ]"
          />
        </div>

        <div>
          <label class="text-xs text-dimmed block mb-1">Pattern</label>
          <UInput v-model="scanPattern" placeholder="VOL20..." />
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <UToggle v-model="scanDuplicateData" />
            <span class="text-xs text-dimmed">duplicateData</span>
          </div>

          <UButton
            icon="i-lucide-radar"
            color="primary"
            :loading="scanning"
            @click="scanBt"
          >
            Lancer
          </UButton>
        </div>
      </div>
    </UPageCard>

    <!-- ADAPTERS -->
    <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Adaptateurs Bluetooth</h3>
        <UButton size="xs" variant="ghost" color="neutral" @click="fetchAdapters">
          Refresh
        </UButton>
      </div>

      <div v-if="!adapters.length" class="text-sm text-dimmed">
        Aucun adaptateur détecté.
      </div>

      <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <UPageCard
          v-for="a in adapters"
          :key="a.address || a.name"
          variant="soft"
          :ui="{ container: 'p-3 gap-y-2' }"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">{{ a.alias || a.name || 'Adapter' }}</div>
              <div class="text-xs text-dimmed font-mono">{{ a.address || 'n/a' }}</div>
            </div>
            <UBadge :color="boolBadgeColor(a.powered)" variant="subtle">
              {{ a.powered ? 'Powered' : 'Off' }}
            </UBadge>
          </div>

          <div class="grid grid-cols-2 gap-2 text-[11px] text-dimmed">
            <div>Discoverable: <span class="font-mono">{{ String(a.discoverable ?? 'n/a') }}</span></div>
            <div>Pairable: <span class="font-mono">{{ String(a.pairable ?? 'n/a') }}</span></div>
            <div>Discovering: <span class="font-mono">{{ String(a.discovering ?? 'n/a') }}</span></div>
          </div>
        </UPageCard>
      </div>
    </UPageCard>

    <!-- FILTRES DEVICES -->
    <UPageCard
      variant="subtle"
      :ui="{ container: 'p-3 sm:p-4 gap-y-0', wrapper: 'items-stretch' }"
    >
      <div class="flex flex-col md:flex-row gap-3 md:items-center">
        <div class="flex-1">
          <UInput
            v-model="q"
            icon="i-lucide-search"
            placeholder="Rechercher par nom, alias, MAC…"
            :disabled="loadingDevices && !devices.length"
          />
        </div>

        <div class="flex flex-wrap gap-2 items-center text-xs">
          <span class="text-dimmed">Paired</span>
          <UButton
            size="2xs"
            variant="ghost"
            :color="pairedFilter === 'all' ? 'primary' : 'neutral'"
            @click="pairedFilter = 'all'"
          >
            Tous
          </UButton>
          <UButton
            size="2xs"
            variant="ghost"
            :color="pairedFilter === 'paired' ? 'primary' : 'neutral'"
            @click="pairedFilter = 'paired'"
          >
            Pairés
          </UButton>
          <UButton
            size="2xs"
            variant="ghost"
            :color="pairedFilter === 'not-paired' ? 'primary' : 'neutral'"
            @click="pairedFilter = 'not-paired'"
          >
            Non pairés
          </UButton>
        </div>

        <div class="flex flex-wrap gap-2 items-center text-xs">
          <span class="text-dimmed">Connexion</span>
          <UButton
            size="2xs"
            variant="ghost"
            :color="connectedFilter === 'all' ? 'primary' : 'neutral'"
            @click="connectedFilter = 'all'"
          >
            Tous
          </UButton>
          <UButton
            size="2xs"
            variant="ghost"
            :color="connectedFilter === 'connected' ? 'primary' : 'neutral'"
            @click="connectedFilter = 'connected'"
          >
            Connectés
          </UButton>
          <UButton
            size="2xs"
            variant="ghost"
            :color="connectedFilter === 'disconnected' ? 'primary' : 'neutral'"
            @click="connectedFilter = 'disconnected'"
          >
            Déconnectés
          </UButton>
        </div>

        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          @click="fetchDevices"
        >
          Appliquer
        </UButton>
      </div>
    </UPageCard>

    <!-- DEVICES CONNUS -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold">Devices connus</h3>
        <div class="text-xs text-dimmed">{{ filteredDevices.length }} affiché(s)</div>
      </div>

      <div v-if="!filteredDevices.length" class="text-sm text-dimmed">
        Aucun device Bluetooth.
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <UPageCard
          v-for="d in filteredDevices"
          :key="getDeviceKey(d)"
          variant="subtle"
          :ui="{ container: 'p-4 gap-y-3' }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-bluetooth" class="w-5 h-5" />
                <span class="font-medium text-base truncate">
                  {{ safeLabel(d) }}
                </span>

                <UBadge :color="boolBadgeColor(d.connected)" variant="subtle" class="text-[8px]">
                  {{ d.connected ? 'Connecté' : 'Déconnecté' }}
                </UBadge>

                <UBadge :color="boolBadgeColor(d.paired)" variant="subtle" class="text-[8px]">
                  {{ d.paired ? 'Pairé' : 'Non pairé' }}
                </UBadge>
              </div>

              <div class="text-xs text-dimmed font-mono">
                {{ d.address || 'n/a' }}
              </div>

              <div class="text-xs text-dimmed">
                RSSI: <span class="font-mono">{{ d.rssi ?? 'n/a' }}</span>
              </div>
              <div class="text-xs text-dimmed">
                Battery: <span class="font-mono">{{ d.battery !== undefined ? `${d.battery}%` : 'n/a' }}</span>
              </div>
            </div>

            <div class="flex flex-col items-end gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                v-if="!d.paired"
                :loading="actionLoading === `pair:${d.address}`"
                @click="pairDevice(d.address)"
              >
                Pair
              </UButton>

              <UButton
                v-if="!d.connected"
                size="xs"
                color="primary"
                variant="ghost"
                :loading="actionLoading === `connect:${d.address}`"
                @click="connectDevice(d.address)"
              >
                Connect
              </UButton>

              <UButton
                v-else
                size="xs"
                color="amber"
                variant="ghost"
                :loading="actionLoading === `disconnect:${d.address}`"
                @click="disconnectDevice(d.address)"
              >
                Disconnect
              </UButton>

              <UButton
                size="xs"
                color="red"
                variant="ghost"
                :loading="actionLoading === `remove:${d.address}`"
                @click="removeDevice(d.address)"
              >
                Remove
              </UButton>
            </div>
          </div>
        </UPageCard>
      </div>
    </div>

    <!-- RESULTATS DE SCAN -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold">Résultats du scan</h3>
        <div class="text-xs text-dimmed">{{ filteredScanResults.length }} trouvé(s)</div>
      </div>

      <div v-if="!filteredScanResults.length" class="text-sm text-dimmed">
        Aucun résultat de scan.
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <UPageCard
          v-for="d in filteredScanResults"
          :key="`scan-${getDeviceKey(d)}`"
          variant="soft"
          :ui="{ container: 'p-4 gap-y-3' }"
        >
          <div class="flex items-start justify-between gap-3" >
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-radar" class="w-5 h-5" />
                <span class="font-medium text-base truncate">
                  {{ safeLabel(d) }}
                </span>
                <UBadge :color="boolBadgeColor(d.paired)" variant="subtle" class="text-[8px]">
                  {{ d.paired ? 'Pairé' : 'Non pairé' }}
                </UBadge>
              </div>

              <div class="text-xs text-dimmed font-mono">
                {{ d.address || 'n/a' }}
              </div>

              <div class="text-xs text-dimmed">
                RSSI: <span class="font-mono">{{ d.rssi ?? 'n/a' }}</span>
              </div>
            </div>

            <div class="flex flex-col items-end gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :loading="actionLoading === `pair:${d.address}`"
                @click="pairDevice(d.address)"
                v-if="!d.paired"
              >
                Pair
              </UButton>

              <UButton
                size="xs"
                color="primary"
                variant="ghost"
                :loading="actionLoading === `connect:${d.address}`"
                @click="connectDevice(d.address)"
                v-if="!d.paired"
              >
                Connect
              </UButton>
            </div>
          </div>
        </UPageCard>
      </div>
    </div>
  </div>
</template>
