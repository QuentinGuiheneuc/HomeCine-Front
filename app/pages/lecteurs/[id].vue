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

    if (!cfg.value.name) cfg.value.name = data.name || ''

    if (data.conf_eq) {
      confEqEnabled.value = true
      confEq.value = {
        rate: Number(data.conf_eq.rate ?? 48000),
        config: String(data.conf_eq.config ?? '7.1'),
        path_eq: String(data.conf_eq.path_eq ?? ''),
        order: Array.isArray(data.conf_eq.order)
          ? [...data.conf_eq.order]
          : ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
      }
    } else {
      confEqEnabled.value = false
    }
  } catch {
    errorMsg.value = 'Impossible de charger ce lecteur.'
    toast.add({ title: 'Erreur', description: errorMsg.value, color: 'error' })
  } finally {
    loading.value = false
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
      conf_eq: confEqEnabled.value ? confEq.value : null
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

onMounted(fetchOne)
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
              :color="Number(lecteur.isStarting) ? 'primary' : 'neutral'"
              variant="subtle"
              class="text-[10px]"
            >
              {{ Number(lecteur.isStarting) ? 'Actif' : 'Arrêté' }}
            </UBadge>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 justify-end">
          <UButton color="neutral" variant="ghost" @click="router.push('/lecteurs')">Retour</UButton>

          <UButton
            v-if="!Number(lecteur.isStarting)"
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
            <UToggle v-model="cfg['enable-volume-normalisation']" />
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
            <UInput v-model="cfg.StreamOutFifo['path-audio']" placeholder="/tmp/spotify/Cuisine_Snap.fifo" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Channels</label>
            <UInput v-model.number="cfg.StreamOutFifo.channels" type="number" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Rate</label>
            <USelect v-model="cfg.StreamOutFifo.rate" :items="rateItems" class="min-w-[220px]" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Config</label>
            <USelect v-model="cfg.StreamOutFifo.config" :items="audioConfigItems" class="min-w-[160px]" />
          </div>
        </div>
      </UPageCard>

      <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Égalisation (EQ)</h3>
          <UToggle v-model="confEqEnabled" />
        </div>

        <div v-if="confEqEnabled" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-dimmed">Sample rate</label>
            <USelect v-model="confEq.rate" :items="rateItems" class="min-w-[220px]" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Configuration</label>
            <USelect v-model="confEq.config" :items="audioConfigItems" class="min-w-[160px]" />
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed">Fichier EQ</label>
            <UInput v-model="confEq.path_eq" placeholder="Cuisine_spotify_EQ.json" />
          </div>

          <div class="md:col-span-2">
            <label class="text-sm text-dimmed mb-1 block">Ordre des canaux</label>

            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="(ch, i) in confEq.order"
                :key="i"
                variant="subtle"
                class="cursor-pointer"
                @click="removeChannel(i)"
              >
                {{ ch }} ✕
              </UBadge>
            </div>

            <div class="flex gap-2 mt-2">
              <USelect v-model="newChannel" :items="channelItems" class="min-w-[120px]" />
              <UButton size="xs" @click="addChannel">Ajouter</UButton>
            </div>
          </div>
        </div>

        <div v-else class="text-sm text-dimmed">
          EQ désactivé (conf_eq sera envoyé à <span class="font-mono">null</span>)
        </div>
      </UPageCard>
    </UPageCard>
  </div>
</template>
