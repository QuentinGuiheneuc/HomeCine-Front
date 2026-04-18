<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createLecteur } from '@/src/api/lecteur'
import { typeItems } from '@/types/lecteur'
import { LAYOUT_ITEMS, CHANNEL_ITEMS } from '@/utils/audioLayouts'
import SpotifyServiceConfig from '@/components/lecteur/services/SpotifyServiceConfig.vue'
import DeezerServiceConfig from '@/components/lecteur/services/DeezerServiceConfig.vue'
import LocalInputServiceConfig from '@/components/lecteur/services/LocalInputServiceConfig.vue'
import LocalServiceConfig from '@/components/lecteur/services/LocalServiceConfig.vue'
import RadioServiceConfig from '@/components/lecteur/services/RadioServiceConfig.vue'

const toast = useToast()
const router = useRouter()

const saving = ref(false)
const errorMsg = ref<string | null>(null)

// ── Config par défaut selon le type ─────────────────────────────────────────
const TRANSPORT_DEFAULTS = () => ({
  localStream: { output_device_index: 0, 'path-audio': '' },
  StreamOutFifo: { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' },
  vban: { dest_ip: '', dest_port: 6980, stream_name: '' }
})

function defaultCfg(type: string): any {
  const t = TRANSPORT_DEFAULTS()

  if (type === 'spotify' || type === 'deezer') {
    return {
      name: '', backend: 'pipe', bitrate: '320',
      'enable-volume-normalisation': false, 'initial-volume': '100',
      'device-type': 'avr', 'path-audio': '/tmp/',
      typeStream: 'StreamOutFifo', frames_per_buffer: 1024,
      ...t
    }
  }

  if (type === 'localInput') {
    return {
      name: '', typeStream: 'localStream', frames_per_buffer: 1024,
      input: { pcm_device: '', rate: 48000, channels: 2, periodsize: 256 },
      output: { layout: '7.1', rate: 48000, master_gain_db: -5, remap: [0, 1, 2, 3, 4, 5, 6, 7] },
      source_path: '', loop: false, input_device: '', sample_rate: 48000,
      ...t
    }
  }

  if (type === 'radio') {
    return { url: '', typeStream: 'StreamOutFifo', ...t }
  }

  if (type === 'local') {
    return { source_path: '', loop: false, typeStream: 'StreamOutFifo', ...t }
  }

  return { typeStream: 'StreamOutFifo', ...t }
}

// ── État principal ───────────────────────────────────────────────────────────
const lecteur = ref({ name: '', type: 'spotify' })
const cfg = ref<any>(defaultCfg('spotify'))

watch(() => lecteur.value.type, (newType) => {
  cfg.value = defaultCfg(newType)
})

// ── EQ ──────────────────────────────────────────────────────────────────────
const confEqEnabled = ref(false)
const confEq = ref({
  rate: 48000,
  config: '7.1',
  path_eq: '',
  order: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
})
const newChannel = ref<string>('FL')

function removeChannel(i: number) { confEq.value.order.splice(i, 1) }
function addChannel() {
  const ch = newChannel.value
  if (!ch || confEq.value.order.includes(ch)) return
  confEq.value.order.push(ch)
}

// ── Création ─────────────────────────────────────────────────────────────────
async function onCreate() {
  try {
    errorMsg.value = null
    saving.value = true
    if (!cfg.value.name) cfg.value.name = lecteur.value.name

    const res = await createLecteur({
      name: lecteur.value.name,
      type: lecteur.value.type,
      config: cfg.value,
      conf_eq: confEqEnabled.value ? confEq.value : null
    })

    toast.add({ title: 'Créé', color: 'success' })
    router.push(res?.id ? `/lecteurs/${res.id}` : '/lecteurs')
  } catch {
    errorMsg.value = 'Création impossible.'
    toast.add({ title: 'Erreur', description: errorMsg.value, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-4 space-y-4">
    <UAlert v-if="errorMsg" color="error" :title="errorMsg" />

    <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
      <!-- Header -->
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm text-dimmed">Nouveau lecteur</div>
          <div class="text-lg font-semibold truncate">{{ lecteur.name || '—' }}</div>
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
          <UButton color="neutral" variant="ghost" @click="router.push('/lecteurs')">Retour</UButton>
          <UButton color="primary" :loading="saving" @click="onCreate">Créer</UButton>
        </div>
      </div>

      <!-- Informations générales -->
      <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
        <h3 class="font-semibold">Informations</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-dimmed">Nom</label>
            <UInput v-model="lecteur.name" placeholder="Cuisine" class="mt-1" />
          </div>
          <div>
            <label class="text-sm text-dimmed">Type</label>
            <USelect v-model="lecteur.type" :items="typeItems" class="mt-1 min-w-[180px]" />
          </div>
        </div>
      </UPageCard>

      <!-- Configuration dynamique selon le type -->
      <SpotifyServiceConfig
        v-if="lecteur.type === 'spotify'"
        v-model:cfg="cfg"
      />
      <DeezerServiceConfig
        v-else-if="lecteur.type === 'deezer'"
        v-model:cfg="cfg"
      />
      <LocalInputServiceConfig
        v-else-if="lecteur.type === 'localInput'"
        v-model:cfg="cfg"
      />
      <LocalServiceConfig
        v-else-if="lecteur.type === 'local'"
        v-model:cfg="cfg"
      />
      <RadioServiceConfig
        v-else-if="lecteur.type === 'radio'"
        v-model:cfg="cfg"
      />

      <!-- EQ -->
      <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Égalisation (EQ)</h3>
          <UToggle v-model="confEqEnabled" />
        </div>

        <div v-if="confEqEnabled" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-dimmed">Sample rate</label>
            <UInput v-model.number="confEq.rate" type="number" placeholder="48000" class="mt-1" />
          </div>
          <div>
            <label class="text-sm text-dimmed">Configuration</label>
            <USelect v-model="confEq.config" :items="LAYOUT_ITEMS" class="mt-1 min-w-[160px]" />
          </div>
          <div class="md:col-span-2">
            <label class="text-sm text-dimmed">Fichier EQ</label>
            <UInput v-model="confEq.path_eq" placeholder="Cuisine_spotify_EQ.json" class="mt-1" />
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
              <USelect v-model="newChannel" :items="CHANNEL_ITEMS" class="min-w-[120px]" />
              <UButton size="xs" @click="addChannel">Ajouter</UButton>
            </div>
          </div>
        </div>

        <div v-else class="text-sm text-dimmed">
          EQ désactivé (<span class="font-mono">conf_eq: null</span>)
        </div>
      </UPageCard>
    </UPageCard>
  </div>
</template>
