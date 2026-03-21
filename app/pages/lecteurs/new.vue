<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import http from '@/src/lib/https'
import { useToast } from '#imports'
import { typeStream } from '../../types/lecteur'

const toast = useToast?.()
const router = useRouter()

const saving = ref(false)
const errorMsg = ref<string | null>(null)

/* -------- Items USelect (Nuxt UI) -------- */
const typeItems = [
  { label: 'Spotify', value: 'spotify' },
  { label: 'Deezer', value: 'deezer' },
  { label: 'Local', value: 'local' },
  { label: 'Radio', value: 'radio' }
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

/* -------- Form state -------- */
const lecteur = ref<any>({
  name: '',
  type: 'spotify'
})

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
  localStream: {
    output_device_index: 0,
    'path-audio': ''
  },
  StreamOutFifo: {
    'path-audio': '',
    channels: 8,
    rate: 48000,
    config: '7.1'
  }
})

function ensureSubConfigs() {
  if (!cfg.value.localStream) cfg.value.localStream = { output_device_index: 0, 'path-audio': '' }
  if (!cfg.value.StreamOutFifo) cfg.value.StreamOutFifo = { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' }
  if (!cfg.value.typeStream) cfg.value.typeStream = 'localStream'
}

watch(() => cfg.value.typeStream, ensureSubConfigs)

const canShowLocalStream = computed(() => cfg.value?.typeStream === 'localStream')
const canShowFifo = computed(() => cfg.value?.typeStream === 'StreamOutFifo')

/* -------- EQ -------- */
const confEqEnabled = ref(true)
const confEq = ref({
  rate: 48000,
  config: '7.1',
  path_eq: '',
  order: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
})
const newChannel = ref<string>('FL')

function removeChannel(i: number) {
  confEq.value.order.splice(i, 1)
}
function addChannel() {
  const ch = newChannel.value
  if (!ch) return
  if (!confEq.value.order.includes(ch)) confEq.value.order.push(ch)
}

/* -------- Submit -------- */
async function createLecteur() {
  try {
    errorMsg.value = null
    saving.value = true

    // Harmonise le nom dans config si tu veux
    if (!cfg.value.name) cfg.value.name = lecteur.value.name

    const payload = {
      name: lecteur.value.name,
      type: lecteur.value.type,
      config: cfg.value,
      conf_eq: confEqEnabled.value ? confEq.value : null
    }

    const res = await http.post('/lecteur', payload)

    toast?.add?.({ title: 'Créé', color: 'green' })

    // si ton API renvoie {id: ...}
    const newId = res?.data?.id
    if (newId) {
      router.push(`/lecteurs/${newId}`)
    } else {
      router.push('/lecteurs')
    }
  } catch (e: any) {
    console.error(e)
    errorMsg.value = "Création impossible."
    toast?.add?.({ title: 'Erreur', description: errorMsg.value, color: 'red' })
  } finally {
    saving.value = false
  }
}
function toggleAutostart() {
  confEqEnabled.value = !confEqEnabled.value
}
ensureSubConfigs()
</script>

<template>
  <div class="p-4 space-y-4">
    <UAlert v-if="errorMsg" color="error" :title="errorMsg" />

    <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
      <!-- Header -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm text-dimmed">Nouveau lecteur</div>
          <div class="text-lg font-semibold truncate">
            {{ lecteur.name || '—' }}
          </div>
        </div>

        <div class="flex flex-wrap gap-2 justify-end">
          <UButton color="neutral" variant="ghost" @click="router.push('/lecteurs')">
            Retour
          </UButton>
          <UButton color="primary" :loading="saving" @click="createLecteur">
            Créer
          </UButton>
        </div>
      </div>

      <!-- Informations -->
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

      <!-- Configuration lecteur -->
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
              :items="typeStream[lecteur.type].bitrateItems"
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
              :items="typeStream[lecteur.type].Device_typeItems"
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
              :items="typeStream[lecteur.type].frames_per_bufferItems"
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

        <!-- localStream -->
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

        <!-- StreamOutFifo -->
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
            <UInput v-model.number="cfg.StreamOutFifo.rate" type="number" />
          </div>

          <div>
            <label class="text-sm text-dimmed">Config</label>
            <USelect v-model="cfg.StreamOutFifo.config" :items="audioConfigItems" class="min-w-[160px]" />
          </div>
        </div>
      </UPageCard>

      <!-- EQ -->
      <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Égalisation (EQ)</h3>
          <USwitch
            v-model="confEqEnabled"
            @click="toggleAutostart()"
          />
        </div>

        <div v-if="confEqEnabled" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-dimmed">Sample rate</label>
            <UInput v-model.number="confEq.rate" type="number" placeholder="48000" />
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
