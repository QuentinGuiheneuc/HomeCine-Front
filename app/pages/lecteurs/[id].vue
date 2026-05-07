<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getLecteur,
  updateLecteur,
  startLecteur,
  stopLecteur,
  type Lecteur
} from '@/src/api/lecteur'
import { typeStreamOptions } from '@/utils/lecteurOptions'
import { typeItems } from '@/types/lecteur'
import { getEqPresets, type EqPreset } from '~/src/api/eq'

const toast = useToast()
const route = useRoute()
const router = useRouter()

const id = Number(route.params.id)

const loading = ref(true)
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const lecteur = ref<Lecteur | null>(null)

const rateItems = [
  { label: '22050 Hz', value: 22050 },
  { label: '24000 Hz', value: 24000 },
  { label: '32000 Hz', value: 32000 },
  { label: '44100 Hz', value: 44100 },
  { label: '48000 Hz', value: 48000 },
  { label: '96000 Hz', value: 96000 }
]

const streamTypeItems = [
  { label: 'LocalStream', value: 'localStream' },
  { label: 'StreamOutFifo', value: 'StreamOutFifo' }
]

const audioConfigItems = [
  { label: '2.0', value: '2.0' },
  { label: '4.2', value: '4.2' },
  { label: '5.1', value: '5.1' },
  { label: '7.1', value: '7.1' }
]

const channelItems = [
  { label: 'FL', value: 'FL' }, { label: 'FR', value: 'FR' },
  { label: 'FC', value: 'FC' }, { label: 'LFE', value: 'LFE' },
  { label: 'BL', value: 'BL' }, { label: 'BR', value: 'BR' },
  { label: 'SL', value: 'SL' }, { label: 'SR', value: 'SR' }
]

const cfg = ref<any>({
  name: '',
  backend: 'pipe',
  bitrate: '320',
  'enable-volume-normalisation': false,
  'initial-volume': '100',
  'device-type': 'avr',
  'path-audio': '/tmp/',
  typeStream: 'localStream',
  frames_per_buffer: 1024,
  localStream: { output_device_index: 0, 'path-audio': '' },
  StreamOutFifo: { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' }
})

function ensureSubConfigs() {
  if (!cfg.value.localStream) cfg.value.localStream = { output_device_index: 0, 'path-audio': '' }
  if (!cfg.value.StreamOutFifo) cfg.value.StreamOutFifo = { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' }
  if (!cfg.value.typeStream) cfg.value.typeStream = 'localStream'
}

const confEqEnabled = ref(false)
const confEq = ref({
  rate: 48000,
  config: '7.1',
  path_eq: '',
  order: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
})
const newChannel = ref<string>('FL')

/* ── EQ Presets ─────────────────────────────────────── */
const eqPresets     = ref<EqPreset[]>([])
const eqPresetsLoad = ref(false)
const selectedEqId  = computed({
  get: () => lecteur.value?.conf_eq ?? null,
  set: (v) => { if (lecteur.value) lecteur.value.conf_eq = v }
})

function toggleEqPreset(id: number) {
  if (selectedEqId.value === id) {
    // Désélectionner → désactive aussi l'EQ
    selectedEqId.value = null
    confEqEnabled.value = false
  } else {
    selectedEqId.value = id
    confEqEnabled.value = true
    eqPresets.value.forEach(p => {
      if (p.id === id && p.config) {
        confEq.value = {
          rate:    p.config.rate,
          config:  p.config.config,
          path_eq: p.config.path_eq,
          order:   p.config.order
        }
        if (p.eq?.config?.channels != null) {
          cfg.value.StreamOutFifo.channels = p.eq.config.channels
        }
        if (p.config.config) {
          cfg.value.StreamOutFifo.config = p.config.config
        }
        if (p.config.rate) {
          cfg.value.StreamOutFifo.rate = p.config.rate
        }
      }
    })
  }
}

const canShowLocalStream = computed(() => cfg.value?.typeStream === 'localStream')
const canShowFifo = computed(() => cfg.value?.typeStream === 'StreamOutFifo')

async function fetchOne() {
  try {
    loading.value = true
    errorMsg.value = null

    const data = await getLecteur(id)
    if (!data) throw new Error('Lecteur introuvable')

    lecteur.value = data
    cfg.value = { ...cfg.value, ...(data.config || {}) }
    ensureSubConfigs()
    confEqEnabled.value = data.conf_eq != null
    if (!cfg.value.name) cfg.value.name = data.name || ''
  } catch {
    errorMsg.value = 'Impossible de charger ce lecteur.'
    toast.add({ title: 'Erreur', description: errorMsg.value, color: 'error' })
  } finally {
    loading.value = false
  }
}
async function fetchEqPresets() {
  try {
    eqPresetsLoad.value = true
    eqPresets.value = await getEqPresets()

    // Synchronise le toggle et la config avancée depuis le lecteur chargé
    const eq = lecteur.value?.conf_eq
    confEqEnabled.value = !!lecteur.value?.conf_eq
    eqPresets.value.forEach(p => {
      if (p.id === eq && p.config) {
        confEq.value = {
          rate:    p.config.rate,
          config:  p.config.config,
          path_eq: p.config.path_eq,
          order:   p.config.order
        }
      }
    })
  } catch {
    toast.add({ title: 'Erreur', description: 'Impossible de charger les presets EQ.', color: 'error' })
  } finally {
    eqPresetsLoad.value = false
  }
}

watch(() => cfg.value.typeStream, ensureSubConfigs)

async function onSave() {
  if (!lecteur.value) return
  try {
    saving.value = true
    await updateLecteur(id, {
      name: lecteur.value.name,
      type: lecteur.value.type,
      config: cfg.value,
      conf_eq: confEqEnabled.value ? lecteur.value.conf_eq ?? null : null,
      autostart: lecteur.value.isStarting
    })
    toast.add({ title: 'Sauvegardé', color: 'success' })
    await fetchOne()
  } catch {
    toast.add({ title: 'Sauvegarde impossible', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function onStart() {
  try {
    await startLecteur(id)
    toast.add({ title: 'Lecteur démarré', color: 'success' })
    await fetchOne()
  } catch {
    toast.add({ title: 'Start impossible', color: 'error' })
  }
}

async function onStop() {
  try {
    await stopLecteur(id)
    toast.add({ title: 'Lecteur stoppé', color: 'secondary' })
    await fetchOne()
  } catch {
    toast.add({ title: 'Stop impossible', color: 'error' })
  }
}

function removeChannel(i: number) {
  confEq.value.order.splice(i, 1)
}
function addChannel() {
  const ch = newChannel.value
  if (!ch || confEq.value.order.includes(ch)) return
  confEq.value.order.push(ch)
}

onMounted(async () => {
  await fetchOne()
  await fetchEqPresets()
})
</script>

<template>
  <div class="p-4 space-y-4">
    <UAlert v-if="errorMsg" color="error" :title="errorMsg" />

    <UAlert v-else-if="loading" color="neutral" title="Chargement..." />

    <UPageCard
      v-else-if="lecteur"
      variant="subtle"
      :ui="{ container: 'p-4 space-y-4' }"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm text-dimmed">Lecteur #{{ id }}</div>
          <div class="text-lg font-semibold truncate">{{ lecteur.name }}</div>
          <div class="text-xs text-dimmed mt-1">
            <UBadge
              :color="lecteur.isStart?.alive ? 'primary' : 'neutral'"
              variant="subtle"
              class="text-[10px]"
            >
              {{ lecteur.isStart?.alive ? 'Actif' : 'Arrêté' }}
            </UBadge>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 justify-end">
          <UButton color="neutral" variant="ghost" @click="router.push('/lecteurs')">Retour</UButton>

          <UButton
            v-if="!lecteur.isStart?.alive"
            color="primary"
            variant="ghost"
            @click="onStart"
          >
            ▶ Start
          </UButton>
          <UButton v-else color="amber" variant="ghost" @click="onStop">⏹ Stop</UButton>

          <UButton color="primary" :loading="saving" @click="onSave">Sauvegarder</UButton>
        </div>
      </div>

      <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
        <h3 class="font-semibold">Informations</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-dimmed">Nom</label>
            <UInput v-model="lecteur.name" placeholder="Cuisine" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Type</label>
            <USelect v-model="lecteur.type" :items="typeItems" class="min-w-[180px]" />
          </div>

          <div class="flex items-center gap-3">
            <label class="text-sm text-dimmed">Auto Start</label>
            <USwitch v-model="lecteur.isStarting" />
          </div>
        </div>
      </UPageCard>

      <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
        <h3 class="font-semibold">Configuration lecteur</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-dimmed">Backend</label>
            <UInput v-model="cfg.backend" placeholder="pipe" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Bitrate</label>
            <USelect
              v-model="cfg.bitrate"
              :items="typeStreamOptions[lecteur.type]?.bitrateItems ?? []"
              class="min-w-[220px]"
            />
          </div>

          <div>
            <label class="text-sm text-dimmed">Initial volume</label>
            <UInput v-model="cfg['initial-volume']" placeholder="100" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Device type</label>
            <USelect
              v-model="cfg['device-type']"
              :items="typeStreamOptions[lecteur.type]?.Device_typeItems ?? []"
              class="min-w-[220px]"
            />
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed">Path audio (base)</label>
            <UInput v-model="cfg['path-audio']" placeholder="/tmp/" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Frames / buffer</label>
            <USelect
              v-model="cfg.frames_per_buffer"
              :items="typeStreamOptions[lecteur.type]?.frames_per_bufferItems ?? []"
              class="min-w-[220px]"
            />
          </div>

          <div>
            <label class="text-sm text-dimmed">Normalisation volume</label>
            <USwitch v-model="cfg['enable-volume-normalisation']" />
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed">Type Stream</label>
            <USelect v-model="cfg.typeStream" :items="streamTypeItems" class="min-w-[220px]" />
          </div>
        </div>

        <div v-if="canShowLocalStream" class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <h4 class="font-semibold text-sm">localStream</h4>
          </div>

          <div>
            <label class="text-sm text-dimmed">Output device index</label>
            <UInput v-model.number="cfg.localStream.output_device_index" type="number" />
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed">Path fifo</label>
            <UInput v-model="cfg.localStream['path-audio']" placeholder="/tmp/spotify/multiroom_Snap.fifo" />
          </div>
        </div>

        <div v-if="canShowFifo" class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <h4 class="font-semibold text-sm">StreamOutFifo</h4>
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed">Path fifo</label>
            <UInput v-model="cfg.StreamOutFifo['path-audio']" placeholder="/tmp/spotify/Cuisine_Snap.fifo" class="w-full flex items-center h-8 rounded-md border border-accented bg-elevated text-sm font-mono"/>
          </div>

          <div>
            <label class="text-sm text-dimmed">Channels</label>
            <input v-if="confEqEnabled" :value="cfg.StreamOutFifo.channels" readonly class="w-full flex items-center h-8 px-3 rounded-md border border-accented bg-elevated text-sm font-mono" />
            <UInput v-else v-model.number="cfg.StreamOutFifo.channels" type="number" class="w-full flex items-center h-8 rounded-md border border-accented font-mono text-sm" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Rate</label>
            <input v-if="confEqEnabled" :value="`${cfg.StreamOutFifo.rate} Hz`" readonly class="min-w-[220px] w-full flex items-center h-8 px-3 rounded-md border border-accented bg-elevated text-sm font-mono" />
            <USelect v-else v-model="cfg.StreamOutFifo.rate" :items="rateItems" class="min-w-[220px] w-full flex items-center h-8 px-3 rounded-md  border-accented bg-elevated text-sm font-mono"  />
          </div>

          <div>
            <label class="text-sm text-dimmed">Config</label>
            <input v-if="confEqEnabled" :value="cfg.StreamOutFifo.config" readonly class="min-w-[160px] w-full flex items-center h-8 px-3 rounded-md border border-accented bg-elevated text-sm font-mono" />
            <USelect v-else v-model="cfg.StreamOutFifo.config" :items="audioConfigItems" class="min-w-[160px] w-full flex items-center h-8 px-3 rounded-md border border-accented bg-elevated text-sm font-mono" />
          </div>
        </div>
      </UPageCard>

      <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">Égalisation (EQ)</h3>
            <p class="text-xs text-dimmed mt-0.5">
              {{ selectedEqId ? `Preset #${selectedEqId} actif` : 'Aucun preset sélectionné' }}
            </p>
          </div>
          <USwitch v-model="confEqEnabled" @update:model-value="(v) => { if (!v) selectedEqId = null }" />
        </div>

        <!-- Cards presets -->
        <div v-if="eqPresetsLoad" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <USkeleton v-for="i in 3" :key="i" class="h-20 rounded-lg" />
        </div>

        <div v-else-if="eqPresets.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            v-for="preset in eqPresets"
            :key="preset.id"
            class="group relative text-left rounded-lg border transition-all p-4 flex items-start gap-3"
            :class="selectedEqId === preset.id
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-default bg-muted hover:bg-accented hover:border-accented'"
            @click="toggleEqPreset(preset.id)"
          >
            <!-- Icône EQ -->
            <div
              class="shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
              :class="selectedEqId === preset.id ? 'bg-primary text-white' : 'bg-accented text-dimmed'"
            >
              <UIcon name="si:equalizer-fill" class="size-5" />
            </div>

            <!-- Infos -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ preset.name }}</p>
              <p class="text-xs text-dimmed truncate mt-0.5">{{ preset.description || `Preset #${preset.id}` }}</p>
              <div class="flex gap-1 mt-1 flex-wrap">
                <UBadge v-if="preset.config?.config" variant="subtle" size="xs" class="font-mono">
                  {{ preset.config.config }}
                </UBadge>
                <UBadge v-if="preset.eq?.config?.channels" variant="subtle" size="xs" class="font-mono">
                  {{ preset.eq.config.channels }} ch
                </UBadge>
              </div>
            </div>
          </button>
        </div>

        <div v-else class="text-sm text-dimmed italic">
          Aucun preset EQ disponible —
          <NuxtLink to="/eq" class="text-primary underline">créer un preset</NuxtLink>
        </div>

        <!-- Config avancée si EQ activé -->
        <div v-if="confEqEnabled && selectedEqId" class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-default">
          <h4 class="md:col-span-2 text-sm font-medium text-dimmed">Configuration avancée</h4>

          <div>
            <label class="text-sm text-dimmed">Sample rate: {{ confEq.rate }}</label>
          </div>

          <div>
            <label class="text-sm text-dimmed">Configuration: {{ confEq.config }}</label>
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed">Fichier EQ: {{ confEq.path_eq }} </label>
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed mb-1 block">Ordre des canaux</label>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="(ch, i) in confEq.order"
                :key="i"
                variant="subtle"
                class="cursor-pointer"
              >{{ ch }}</UBadge>
            </div>
          </div>
        </div>
      </UPageCard>
    </UPageCard>
  </div>
</template>
