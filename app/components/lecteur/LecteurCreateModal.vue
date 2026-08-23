<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { createLecteur } from '@/src/api/lecteur'
import { getEqPresets, type EqPreset } from '@/src/api/eq'
import { typeItems } from '@/types/lecteur'
import TokenUserSelect from '@/components/lecteur/TokenUserSelect.vue'
import SpotifyServiceConfig from '@/components/lecteur/services/SpotifyServiceConfig.vue'
import FilePlayerServiceConfig from '@/components/lecteur/services/FilePlayerServiceConfig.vue'
import DeezerServiceConfig from '@/components/lecteur/services/DeezerServiceConfig.vue'
import YouTubeServiceConfig from '@/components/lecteur/services/YouTubeServiceConfig.vue'
import LocalInputServiceConfig from '@/components/lecteur/services/LocalInputServiceConfig.vue'
import LocalServiceConfig from '@/components/lecteur/services/LocalServiceConfig.vue'
import RadioServiceConfig from '@/components/lecteur/services/RadioServiceConfig.vue'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'created', lecteur: any): void }>()

const toast  = useToast()
const saving = ref(false)
const errorMsg = ref<string | null>(null)

/* Étapes : choix du type → formulaire */
const step = ref<'choose' | 'form'>('choose')

const typeIcon = (t: string) =>
  t === 'spotify' ? 'mdi:spotify'
    : t === 'fileplayer' ? 'mdi:file-music'
    : t === 'deezer' ? 'i-simple-icons-deezer'
    : t === 'youtube' ? 'mdi:youtube'
    : t === 'radio' ? 'i-lucide-radio'
    : t === 'localInput' ? 'mdi:audio-input-rca'
    : 'i-lucide-music'

/* ── Config par défaut selon le type ─────────────────────────────────────── */
const TRANSPORT_DEFAULTS = () => ({
  localStream: { output_device_index: 0, 'path-audio': '' },
  StreamOutFifo: { 'path-audio': '', channels: 8, rate: 48000, config: '7.1' },
  vban: { dest_ip: '', dest_port: 6980, stream_name: '' }
})

function defaultCfg(type: string): any {
  const t = TRANSPORT_DEFAULTS()
  if (type === 'spotify' || type === 'deezer') {
    return {
      name: '', backend: 'pipe', bitrate: '320', tokenUserId: null,
      'enable-volume-normalisation': false, 'initial-volume': '100',
      'device-type': 'avr', 'path-audio': '/tmp/',
      typeStream: 'StreamOutFifo', frames_per_buffer: 1024, ...t
    }
  }
  if (type === 'localInput') {
    return {
      name: '', typeStream: 'localStream', frames_per_buffer: 1024,
      input: { pcm_device: '', rate: 48000, channels: 2, periodsize: 256 },
      output: { layout: '7.1', rate: 48000, master_gain_db: -5, remap: [0, 1, 2, 3, 4, 5, 6, 7] },
      source_path: '', loop: false, input_device: '', sample_rate: 48000, ...t
    }
  }
  if (type === 'fileplayer') {
    return { name: '', typeStream: 'StreamOutFifo', queue: [], volume: 85, repeat: false, shuffle: false, ...t }
  }
  if (type === 'youtube') {
    return { name: '', typeStream: 'StreamOutFifo', tokenUserId: null, ...t, StreamOutFifo: { 'path-audio': '/tmp/youtube/out.fifo', channels: 6, rate: 48000 } }
  }
  if (type === 'radio') return { url: '', typeStream: 'StreamOutFifo', ...t }
  if (type === 'local') return { source_path: '', loop: false, typeStream: 'StreamOutFifo', ...t }
  return { typeStream: 'StreamOutFifo', ...t }
}

/* ── État ───────────────────────────────────────────────────────────────── */
const lecteur = ref({ name: '', type: 'spotify', isStarting: false })
const cfg = ref<any>(defaultCfg('spotify'))

const AUTH_TYPES = ['spotify', 'deezer', 'youtube']
const isAuthType = computed(() => AUTH_TYPES.includes(lecteur.value.type))

watch(() => lecteur.value.type, (t) => { cfg.value = defaultCfg(t) })

function chooseType(type: string) {
  lecteur.value = { name: '', type, isStarting: false }
  cfg.value = defaultCfg(type)
  selectedEqPresetId.value = null
  confEqEnabled.value = false
  errorMsg.value = null
  step.value = 'form'
}

/* ── EQ presets ─────────────────────────────────────────────────────────── */
const eqPresets          = ref<EqPreset[]>([])
const eqLoading          = ref(false)
const confEqEnabled      = ref(false)
const selectedEqPresetId = ref<number | null>(null)

const selectedPreset = computed(() => eqPresets.value.find(p => p.id === selectedEqPresetId.value) ?? null)
const confEq = computed(() => {
  const c = selectedPreset.value?.config
  if (!c) return null
  return { rate: c.rate ?? 48000, config: c.config ?? '7.1', path_eq: c.path_eq ?? '', order: Array.isArray(c.order) ? c.order : [] }
})

function toggleEqPreset(id: number) {
  if (selectedEqPresetId.value === id) {
    selectedEqPresetId.value = null
    confEqEnabled.value = false
  } else {
    selectedEqPresetId.value = id
    confEqEnabled.value = true
    const preset = eqPresets.value.find(p => p.id === id)
    if (preset?.eq?.config?.channels != null && cfg.value.StreamOutFifo) cfg.value.StreamOutFifo.channels = preset.eq.config.channels
    if (preset?.config?.config && cfg.value.StreamOutFifo) cfg.value.StreamOutFifo.config = preset.config.config
    if (preset?.config?.rate && cfg.value.StreamOutFifo) cfg.value.StreamOutFifo.rate = preset.config.rate
  }
}

async function loadEqPresets() {
  if (eqPresets.value.length) return
  eqLoading.value = true
  try { eqPresets.value = await getEqPresets() }
  catch { toast.add({ title: 'Impossible de charger les presets EQ', color: 'error' }) }
  finally { eqLoading.value = false }
}

/* Reset / chargement à l'ouverture */
watch(open, (v) => {
  if (v) { step.value = 'choose'; loadEqPresets() }
})

/* ── Création ───────────────────────────────────────────────────────────── */
async function onCreate() {
  try {
    errorMsg.value = null
    saving.value = true
    if (!cfg.value.name) cfg.value.name = lecteur.value.name

    const res = await createLecteur({
      name: lecteur.value.name,
      type: lecteur.value.type,
      config: cfg.value,
      conf_eq: confEqEnabled.value ? selectedEqPresetId.value : null,
      isStarting: lecteur.value.isStarting,
      autostart: lecteur.value.isStarting
    } as any)
    toast.add({ title: 'Lecteur créé', color: 'success' })
    open.value = false
    emit('created', res)
  } catch {
    errorMsg.value = 'Création impossible.'
    toast.add({ title: 'Erreur', description: errorMsg.value, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="step === 'choose' ? 'Nouveau lecteur' : `Nouveau lecteur — ${lecteur.type}`" :ui="{ content: 'max-w-3xl' }">
    <template #content>
      <!-- Étape 1 : choix du type -->
      <div v-if="step === 'choose'" class="p-6 space-y-4">
        <p class="text-sm text-dimmed">Choisissez le type de lecteur à créer.</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <button
            v-for="t in typeItems"
            :key="t.value"
            class="group flex flex-col items-center justify-center gap-2 rounded-xl border border-default bg-elevated/30 hover:bg-elevated/60 hover:border-primary transition-colors p-4 aspect-square"
            @click="chooseType(t.value)"
          >
            <UIcon :name="typeIcon(t.value)" class="size-7 text-dimmed group-hover:text-primary transition-colors" />
            <span class="text-sm font-medium">{{ t.label }}</span>
          </button>
        </div>
      </div>

      <!-- Étape 2 : formulaire -->
      <div v-else class="flex flex-col max-h-[80vh]">
        <!-- Header -->
        <div class="flex items-center justify-between gap-3 p-4 border-b border-default">
          <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="step = 'choose'">Type</UButton>
          <div class="flex gap-2">
            <UButton color="neutral" variant="soft" @click="open = false">Annuler</UButton>
            <UButton color="primary" :loading="saving" icon="i-lucide-check" @click="onCreate">Créer</UButton>
          </div>
        </div>

        <!-- Corps scrollable -->
        <div class="overflow-y-auto p-4 space-y-4">
          <UAlert v-if="errorMsg" color="error" :title="errorMsg" />

          <!-- Informations -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-dimmed">Nom</label>
              <UInput v-model="lecteur.name" placeholder="Cuisine" class="mt-1 w-full" />
            </div>
            <div>
              <label class="text-sm text-dimmed">Type</label>
              <USelect v-model="lecteur.type" :items="typeItems" class="mt-1 w-full" />
            </div>
            <div class="flex items-center gap-3">
              <USwitch v-model="lecteur.isStarting" />
              <span class="text-sm">Démarrer à la création</span>
            </div>
            <TokenUserSelect v-if="isAuthType" v-model="cfg.tokenUserId" :provider="lecteur.type" class="md:col-span-2" />
          </div>

          <!-- Config dynamique -->
          <SpotifyServiceConfig v-if="lecteur.type === 'spotify'" v-model:cfg="cfg" />
          <FilePlayerServiceConfig v-else-if="lecteur.type === 'fileplayer'" v-model:cfg="cfg" />
          <DeezerServiceConfig v-else-if="lecteur.type === 'deezer'" v-model:cfg="cfg" />
          <YouTubeServiceConfig v-else-if="lecteur.type === 'youtube'" v-model:cfg="cfg" />
          <LocalInputServiceConfig v-else-if="lecteur.type === 'localInput'" v-model:cfg="cfg" />
          <LocalServiceConfig v-else-if="lecteur.type === 'local'" v-model:cfg="cfg" />
          <RadioServiceConfig v-else-if="lecteur.type === 'radio'" v-model:cfg="cfg" />

          <!-- EQ -->
          <UPageCard variant="subtle" :ui="{ container: 'p-4 space-y-4' }">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold">Égalisation (EQ)</h3>
                <p class="text-xs text-dimmed mt-0.5">{{ selectedEqPresetId ? `Preset #${selectedEqPresetId} actif` : 'Aucun preset sélectionné' }}</p>
              </div>
              <USwitch v-model="confEqEnabled" @update:model-value="(v) => { if (!v) selectedEqPresetId = null }" />
            </div>

            <div v-if="eqLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <USkeleton v-for="i in 3" :key="i" class="h-20 rounded-lg" />
            </div>
            <div v-else-if="eqPresets.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                v-for="preset in eqPresets"
                :key="preset.id"
                class="group relative text-left rounded-lg border transition-all p-3 flex items-start gap-3"
                :class="selectedEqPresetId === preset.id ? 'border-primary bg-primary/10 shadow-sm' : 'border-default bg-muted hover:bg-accented'"
                @click="toggleEqPreset(preset.id)"
              >
                <div class="shrink-0 w-9 h-9 rounded-md flex items-center justify-center" :class="selectedEqPresetId === preset.id ? 'bg-primary text-white' : 'bg-accented text-dimmed'">
                  <UIcon name="si:equalizer-fill" class="size-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ preset.name }}</p>
                  <p class="text-xs text-dimmed truncate mt-0.5">{{ preset.description || `Preset #${preset.id}` }}</p>
                </div>
              </button>
            </div>
            <div v-else class="text-sm text-dimmed italic">
              Aucun preset EQ — <NuxtLink to="/eq" class="text-primary underline">créer un preset</NuxtLink>
            </div>
          </UPageCard>
        </div>
      </div>
    </template>
  </UModal>
</template>
