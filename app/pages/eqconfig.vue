<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  getEqPresets,
  createEqPreset,
  updateEqPreset,
  deleteEqPreset,
  type EqPreset
} from '@/src/api/eq'
import { AUDIO_LAYOUTS, LAYOUT_ITEMS, CHANNEL_ITEMS } from '@/utils/audioLayouts'

const toast = useToast()

const presets = ref<EqPreset[]>([])
const loading = ref(true)
const errorMsg = ref<string | null>(null)

const q = ref('')

const showForm = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)

const rateItems = [
  { label: '22050 Hz', value: 22050 },
  { label: '44100 Hz', value: 44100 },
  { label: '48000 Hz', value: 48000 },
  { label: '88200 Hz', value: 88200 },
  { label: '96000 Hz', value: 96000 },
  { label: '192000 Hz', value: 192000 }
]

const form = ref({
  name: '',
  description: '',
  rate: 48000,
  path_eq: '',
  inputConfig: '7.1',
  outputOrder: [...(AUDIO_LAYOUTS['7.1']?.order ?? [])]
})

const inputLayout = computed(() => AUDIO_LAYOUTS[form.value.inputConfig] ?? null)

const CHUNK_SIZE = 12

const channelChunks = computed(() => {
  const order = inputLayout.value?.order ?? []
  if (order.length <= CHUNK_SIZE) return [{ start: 0, channels: order }]
  const chunks = []
  for (let i = 0; i < order.length; i += CHUNK_SIZE) {
    chunks.push({ start: i, channels: order.slice(i, i + CHUNK_SIZE) })
  }
  return chunks
})

watch(() => form.value.inputConfig, (key) => {
  const layout = AUDIO_LAYOUTS[key]
  if (layout) form.value.outputOrder = [...layout.order]
})

async function fetchPresets() {
  try {
    loading.value = true
    errorMsg.value = null
    presets.value = await getEqPresets()
  } catch {
    errorMsg.value = 'Impossible de charger les presets EQ.'
    toast.add({ title: 'Erreur', description: errorMsg.value, color: 'error' })
  } finally {
    loading.value = false
  }
}

function normalizeConfig(p: EqPreset) {
  return p.config || {}
}
function getRate(p: EqPreset) {
  return normalizeConfig(p).rate ?? 'n/a'
}
function getInputConfig(p: EqPreset) {
  return normalizeConfig(p).config ?? 'n/a'
}
function getChannelsCount(p: EqPreset) {
  const order = normalizeConfig(p).order
  return Array.isArray(order) ? order.length : 'n/a'
}
function getPathEq(p: EqPreset) {
  return normalizeConfig(p).path_eq ?? 'n/a'
}

const filteredPresets = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s) return presets.value
  return presets.value.filter(p =>
    String(p.id).includes(s) ||
    (p.name || '').toLowerCase().includes(s) ||
    (p.description || '').toLowerCase().includes(s) ||
    String(getInputConfig(p)).toLowerCase().includes(s)
  )
})

function resetForm() {
  editingId.value = null
  form.value = {
    name: '',
    description: '',
    rate: 48000,
    path_eq: '',
    inputConfig: '7.1',
    outputOrder: [...(AUDIO_LAYOUTS['7.1']?.order ?? [])]
  }
}

function openCreate() {
  resetForm()
  showForm.value = true
}

function openEdit(p: EqPreset) {
  const cfg = normalizeConfig(p)
  editingId.value = p.id
  form.value.name = p.name || ''
  form.value.description = p.description || ''
  form.value.rate = Number(cfg.rate ?? 48000)
  form.value.path_eq = String(cfg.path_eq ?? '')
  form.value.inputConfig = String(cfg.config ?? '7.1')
  form.value.outputOrder = Array.isArray(cfg.order)
    ? [...cfg.order]
    : [...(AUDIO_LAYOUTS[form.value.inputConfig]?.order ?? [])]
  showForm.value = true
}

async function save() {
  if (!form.value.name.trim()) {
    toast.add({ title: 'Nom requis', color: 'error' })
    return
  }
  const payload = {
    name: form.value.name.trim(),
    description: form.value.description || '',
    config: {
      rate: Number(form.value.rate || 48000),
      config: form.value.inputConfig,
      path_eq: form.value.path_eq || '',
      order: form.value.outputOrder
    }
  }
  try {
    saving.value = true
    if (editingId.value) {
      await updateEqPreset(editingId.value, payload)
      toast.add({ title: 'Preset modifié', color: 'success' })
    } else {
      await createEqPreset(payload)
      toast.add({ title: 'Preset créé', color: 'success' })
    }
    showForm.value = false
    await fetchPresets()
  } catch {
    toast.add({ title: 'Sauvegarde impossible', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function onDelete(id: number) {
  if (!confirm(`Supprimer le preset EQ #${id} ?`)) return
  try {
    await deleteEqPreset(id)
    toast.add({ title: 'Supprimé', color: 'success' })
    await fetchPresets()
  } catch {
    toast.add({ title: 'Suppression impossible', color: 'error' })
  }
}

onMounted(fetchPresets)
</script>

<template>
  <div class="flex flex-col gap-6 pb-10 px-3 sm:px-4 lg:px-6">
    <!-- Navbar -->
    <div class="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 pt-4 pb-3">
      <UDashboardNavbar
        class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default"
        style="height: 80px;"
      >
        <template #left>
          <UPageCard
            title="EQ Presets"
            description="Gestion des presets d'égalisation."
            variant="naked"
            orientation="horizontal"
            class="mb-0"
          />
        </template>

        <template #right>
          <div class="flex flex-wrap gap-2 w-full lg:w-auto lg:ms-auto items-center">
            <div class="hidden sm:flex items-center gap-2 text-xs text-dimmed">
              <span>Total: {{ presets.length }}</span>
              <span>· Affichés: {{ filteredPresets.length }}</span>
            </div>
            <UButton icon="i-lucide-plus" color="primary" @click="openCreate">Nouveau</UButton>
            <UButton icon="i-lucide-refresh-ccw" color="neutral" :loading="loading" @click="fetchPresets">Rafraîchir</UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </div>

    <UAlert v-if="errorMsg" color="red" :title="errorMsg" />
    <UAlert v-else-if="!loading && !presets.length" color="neutral" title="Aucun preset EQ en base." />

    <!-- Filtre -->
    <UPageCard variant="subtle" :ui="{ container: 'p-3 sm:p-4 gap-y-0' }">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Rechercher par nom, description, config…"
        :disabled="loading || !presets.length"
      />
    </UPageCard>

    <!-- Formulaire -->
    <UCard v-if="showForm" :ui="{ body: 'space-y-5' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-5" />
          <h3 class="font-semibold">
            {{ editingId ? `Modifier preset #${editingId}` : 'Nouveau preset EQ' }}
          </h3>
          <UButton
            class="ms-auto" size="xs" color="neutral" variant="ghost"
            icon="i-lucide-x" @click="showForm = false"
          />
        </div>
      </template>

      <!-- Champs de base -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-sm text-dimmed">Nom</label>
          <UInput v-model="form.name" placeholder="ex. Cuisine Spotify EQ" class="mt-1" />
        </div>

        <div>
          <label class="text-sm text-dimmed">Description</label>
          <UInput v-model="form.description" placeholder="ex. preset 7.1 pour Cuisine" class="mt-1" />
        </div>

        <div>
          <label class="text-sm text-dimmed">Sample rate</label>
          <USelect v-model="form.rate" :items="rateItems" class="mt-1" />
        </div>

        <div>
          <label class="text-sm text-dimmed">Fichier EQ</label>
          <UInput v-model="form.path_eq" placeholder="Cuisine_spotify_EQ.json" class="mt-1" />
        </div>

        <div class="md:col-span-2">
          <label class="text-sm text-dimmed">Configuration d'entrée</label>
          <div class="flex items-center gap-3 mt-1">
            <USelect v-model="form.inputConfig" :items="LAYOUT_ITEMS" class="max-w-xs" />
            <span class="text-xs text-dimmed">
              {{ inputLayout?.channels ?? 0 }} canaux
            </span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showForm = false">Annuler</UButton>
          <UButton color="primary" :loading="saving" @click="save">Sauvegarder</UButton>
        </div>
      </template>
    </UCard>

    <!-- Tableau Input / Output (hors UCard pour éviter l'overflow:hidden du card) -->
    <div v-if="showForm && inputLayout" class="space-y-3">
      <div>
        <div class="text-sm font-medium px-1">Mapping des canaux</div>
        <p class="text-xs text-dimmed px-1 mt-0.5">
          La ligne <strong>Input</strong> reflète le layout sélectionné (lecture seule).
          La ligne <strong>Output</strong> définit le nom affecté à chaque position — modifiable.
          <span v-if="channelChunks.length > 1" class="text-primary">
            · Tableau découpé en {{ channelChunks.length }} blocs de {{ CHUNK_SIZE }} canaux max.
          </span>
        </p>
      </div>

      <div
        v-for="chunk in channelChunks"
        :key="chunk.start"
        class="overflow-x-auto rounded-lg border border-default"
      >
        <table class="w-full text-sm border-collapse" style="min-width: max-content;">
          <thead>
            <tr class="bg-muted/40">
              <th class="px-3 py-2 text-left font-medium text-dimmed border-b border-r border-default w-24 sticky left-0 bg-muted/60 z-10">
                Rôle
              </th>
              <th
                v-for="(_, j) in chunk.channels"
                :key="j"
                class="px-3 py-2 text-center font-mono text-xs text-dimmed border-b border-default"
                style="min-width: 80px;"
              >
                Ch {{ chunk.start + j }}
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- Input (read-only) -->
            <tr class="border-b border-default bg-muted/10">
              <td class="px-3 py-2 border-r border-default sticky left-0 bg-muted/30 z-10">
                <div class="flex items-center gap-1.5 whitespace-nowrap">
                  <UIcon name="i-lucide-arrow-right-to-line" class="size-3.5 text-dimmed shrink-0" />
                  <span class="text-xs font-medium text-dimmed">Input</span>
                </div>
              </td>
              <td
                v-for="(ch, j) in chunk.channels"
                :key="j"
                class="px-3 py-2 text-center"
              >
                <UBadge variant="subtle" color="neutral" class="font-mono text-xs">{{ ch }}</UBadge>
              </td>
            </tr>

            <!-- Output (éditable) -->
            <tr>
              <td class="px-3 py-2 border-r border-default sticky left-0 bg-background z-10">
                <div class="flex items-center gap-1.5 whitespace-nowrap">
                  <UIcon name="i-lucide-arrow-right-from-line" class="size-3.5 text-primary shrink-0" />
                  <span class="text-xs font-medium text-primary">Output</span>
                </div>
              </td>
              <td
                v-for="(_, j) in chunk.channels"
                :key="j"
                class="px-1.5 py-1.5 text-center"
              >
                <USelect
                  v-model="form.outputOrder[chunk.start + j]"
                  :items="CHANNEL_ITEMS"
                  size="xs"
                  class="font-mono"
                  style="min-width: 72px;"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Liste des presets -->
    <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      <UPageCard
        v-for="p in filteredPresets"
        :key="p.id"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-3' }"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-base truncate">{{ p.name || 'Sans nom' }}</span>
              <UBadge variant="subtle" class="text-[10px] font-mono shrink-0">{{ getInputConfig(p) }}</UBadge>
            </div>
            <div class="text-xs text-dimmed truncate">{{ p.description || 'Aucune description' }}</div>
          </div>

          <div class="flex flex-col items-end gap-1 shrink-0 text-[10px]">
            <span class="text-dimmed">ID #{{ p.id }}</span>
            <div class="flex gap-2 mt-1">
              <UButton size="xs" variant="ghost" color="neutral" @click="openEdit(p)">Éditer</UButton>
              <UButton size="xs" variant="ghost" color="red" @click="onDelete(p.id)">Supprimer</UButton>
            </div>
          </div>
        </div>

        <!-- Aperçu mapping output -->
        <div>
          <div class="text-[10px] text-dimmed mb-1">Mapping output</div>
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="(ch, i) in (normalizeConfig(p).order || [])"
              :key="i"
              variant="outline"
              class="font-mono text-[10px]"
            >
              {{ i }}→{{ ch }}
            </UBadge>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div class="text-dimmed">Rate</div>
            <div class="font-mono">{{ getRate(p) }}</div>
          </div>
          <div>
            <div class="text-dimmed">Canaux</div>
            <div class="font-mono">{{ getChannelsCount(p) }}</div>
          </div>
          <div class="overflow-hidden">
            <div class="text-dimmed">Fichier</div>
            <div class="font-mono truncate">{{ getPathEq(p) }}</div>
          </div>
        </div>
      </UPageCard>
    </div>
  </div>
</template>
