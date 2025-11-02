<script setup lang="ts">
import http from '../src/lib/https'

// Types
type Device = {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  supports_volume: boolean
  type: 'Computer' | 'Smartphone' | 'Speaker' | string
  volume_percent: number
}
type DevicesResponse = { devices: Device[] }
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const { isDeviceSlideoverOpen } = useDashboard()

// --- STATE réactif ---
const devices = ref<Device[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)

const transferring = ref<string | null>(null)
const settingVolume = ref<string | null>(null)

// Icône par type
const deviceIcon = (t: Device['type']) => {
  const map: Record<string, string> = {
    Computer: 'i-lucide-monitor',
    Smartphone: 'i-lucide-smartphone',
    Speaker: 'i-lucide-speaker',
    AVR: 'material-symbols:audio-video-receiver-rounded'
  }
  return map[t] ?? 'i-lucide-monitor'
}

// Fetch (réutilisé par refresh et au montage)
async function fetchDevices() {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await http<DevicesResponse>('/spotify/devices', {
      method: 'GET'
    })
    // ⚠️ MISE À JOUR réactive
    devices.value = res.data.devices ?? []
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.message || 'Failed to load devices'
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await fetchDevices()
}

// Actions (exemples; branche tes endpoints réels)
async function transferPlayback(deviceId: string) {
  if (transferring.value) return // évite le double-clic
  try {
    transferring.value = deviceId
    await http.put('/spotify/devices/transfer', { device_id: deviceId, play: true }, {
      withCredentials: true // si nécessaire dans ton http client
      // baseURL: 'http://192.168.1.19:3007/', // si ton instance http n'a pas de baseURL
    })
    // petit délai pour laisser l'état serveur se stabiliser
    await sleep(1000)
    await fetchDevices()
  } finally {
    transferring.value = null
  }
}

const setVolumeDebounced = useDebounceFn(async (device: Device, pct: number) => {
  try {
    settingVolume.value = device.id
    console.log(`Setting volume of device ${device.id} to ${pct}%`)
    await http.put('/spotify/devices/volume', { device_id: device.id, volume_percent: pct })
  } finally {
    settingVolume.value = null
  }
}, 200)
const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n))
function onWheelVolume(device: Device, e: WheelEvent) {
  // pas de base: 5 ; ⇧ Shift = 10
  const step = e.shiftKey ? 2 : 2
  // deltaY > 0 = molette vers le bas => on diminue le volume
  const delta = e.deltaY > 0 ? -step : step
  const next = clamp(device.volume_percent + delta, 0, 100)

  if (next !== device.volume_percent) {
    // UI optimiste + API debounce que tu as déjà
    device.volume_percent = next
    setVolumeDebounced(device, next)
  }

  // Évite que la page/Slideover scroll
  e.preventDefault()
}
async function setVolume(device: Device, pct: number) {
  if (!device.supports_volume) return
  // UI optimiste + debounce côté API
  device.volume_percent = pct
  await setVolumeDebounced(device, pct)
}

// Charger au montage (ou quand le slideover s’ouvre)
onMounted(fetchDevices)
watch(isDeviceSlideoverOpen, (open) => {
  if (open) {
    fetchDevices()
  }
})
</script>

<template>
  <USlideover
    v-model:open="isDeviceSlideoverOpen"
    title="Devices"
    :ui="{ content: 'max-w-2xl w-screen', header: 'px-3 py-5', body: 'px-0 py-0', footer: 'px-6 py-5' }"
  >
    <template #body>
      <div class="px-6 py-3 border-b border-default flex items-center justify-between">
        <div class="text-sm text-dimmed">
          <span v-if="!loading">{{ devices.length }} device{{ devices.length > 1 ? 's' : '' }}</span>
          <span v-else>Loading…</span>
        </div>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-refresh-ccw"
          :loading="loading"
          @click="refresh"
        >
          Refresh
        </UButton>
      </div>

      <div class="p-2">
        <UAlert v-if="errorMsg" color="red" class="mx-3 my-2" :title="errorMsg" />

        <div
          v-for="d in devices"
          :key="d.id"
          class="px-3 py-3 rounded-md hover:bg-elevated/50 flex items-center gap-4"
        >
          <UAvatar :icon="deviceIcon(d.type)" size="xl" class="shrink-0" />

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="truncate text-base font-medium">{{ d.name }}</p>
              <UBadge v-if="d.is_active" color="primary" variant="subtle" size="xs">Active</UBadge>
              <UBadge v-else color="neutral" variant="soft" size="xs">Idle</UBadge>
            </div>
            <p class="text-xs text-dimmed">
              {{ d.type }} · {{ d.supports_volume ? `Vol ${d.volume_percent}%` : 'No volume control' }}
              <span v-if="d.is_private_session"> · Private</span>
              <span v-if="d.is_restricted"> · Restricted</span>
            </p>

            <div v-if="d.supports_volume" class="mt-2 flex items-center gap-2 max-w-sm">
              <UIcon :name="d.volume_percent === 0 ? 'i-lucide-volume-x' : (d.volume_percent < 50 ? 'i-lucide-volume-1' : 'i-lucide-volume-2')" />
              <input
                type="range"
                min="0"
                max="100"
                :value="d.volume_percent"
                class="w-full accent-current h-1.5 range-primary-0"
                :disabled="settingVolume === d.id"
                @input="setVolume(d, ($event.target as HTMLInputElement).valueAsNumber)"
                @wheel.prevent="onWheelVolume(d, $event)"
              />
              <span class="text-xs tabular-nums w-10 text-right">{{ d.volume_percent }}%</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              :label="d.is_active ? 'Using' : 'Use device'"
              :color="d.is_active ? 'primary' : 'neutral'"
              :variant="d.is_active ? 'solid' : 'outline'"
              size="sm"
              :loading="transferring === d.id"
              :disabled="d.is_active"
              @click="transferPlayback(d.id)"
            />
          </div>
        </div>

        <!-- Skeleton lorsque loading et pas encore de data -->
        <div v-if="loading && devices.length === 0" class="px-3 py-3 text-sm text-dimmed">Loading devices…</div>
      </div>
    </template>
  </USlideover>
</template>
