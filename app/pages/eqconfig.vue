<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from '#imports'
import http from '@/src/lib/https'

type EqPreset = {
  id: number
  name: string
  description: string
  config: any // JSON en objet côté API
}

const toast = useToast?.()

/* ---------- State ---------- */
const presets = ref<EqPreset[]>([])
const loading = ref(true)
const errorMsg = ref<string | null>(null)

/* Filtres */
const q = ref('')
const cfgFilter = ref<'all' | '2.0' | '4.2' | '5.1' | '7.1'>('all')

/* Form (create/edit inline card) */
const showForm = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)

const form = ref({
  name: '',
  description: '',
  rate: 48000,
  audioConfig: '7.1' as '2.0' | '4.2' | '5.1' | '7.1',
  path_eq: '',
  order: ['FL','FR','FC','LFE','BL','BR','SL','SR'] as string[]
})

/* Pour ajouter / retirer des canaux */
const channelItems = [
  { label: 'FL', value: 'FL' },
  { label: 'FR', value: 'FR' },
  { label: 'FC', value: 'FC' },
  { label: 'LFE', value: 'LFE' },
  { label: 'BL', value: 'BL' },
  { label: 'BR', value: 'BR' },
  { label: 'SL', value: 'SL' },
  { label: 'SR', value: 'SR' }
]
const newChannel = ref<string>('FL')

/* USelect Nuxt UI v4 -> items */
const audioConfigItems = [
  { label: '2.0', value: '2.0' },
  { label: '4.2', value: '4.2' },
  { label: '5.1', value: '5.1' },
  { label: '7.1', value: '7.1' }
]

const filterItems = [
  { label: 'Tous', value: 'all' },
  ...audioConfigItems
]

/* ---------- API ---------- */
async function fetchPresets() {
  try {
    loading.value = true
    errorMsg.value = null
    const res = await http.get('/eq')
    presets.value = res.data || []
  } catch (e: any) {
    console.error(e)
    errorMsg.value = 'Impossible de charger les presets EQ.'
    toast?.add?.({ title: 'Erreur', description: errorMsg.value, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function createPreset(payload: any) {
  return http.post('/eq', payload)
}
async function updatePreset(id: number, payload: any) {
  return http.put(`/eq/${id}`, payload)
}
async function deletePreset(id: number) {
  return http.delete(`/eq/${id}`)
}

/* ---------- Helpers ---------- */
function normalizeConfig(p: EqPreset) {
  // ton DB stocke "config" JSON, l'API le parse déjà.
  return p.config || {}
}
function getRate(p: EqPreset) {
  return normalizeConfig(p).rate ?? 'n/a'
}
function getAudioConfig(p: EqPreset) {
  return normalizeConfig(p).config ?? 'n/a'
}
function getChannelsCount(p: EqPreset) {
  const order = normalizeConfig(p).order
  return Array.isArray(order) ? order.length : 'n/a'
}
function getPathEq(p: EqPreset) {
  return normalizeConfig(p).path_eq ?? 'n/a'
}

/* ---------- Computed ---------- */
const filteredPresets = computed(() => {
  let arr = [...presets.value]

  if (cfgFilter.value !== 'all') {
    arr = arr.filter(p => String(getAudioConfig(p)) === cfgFilter.value)
  }

  const s = q.value.trim().toLowerCase()
  if (s) {
    arr = arr.filter(p =>
      String(p.id).includes(s) ||
      (p.name || '').toLowerCase().includes(s) ||
      (p.description || '').toLowerCase().includes(s) ||
      String(getAudioConfig(p)).toLowerCase().includes(s)
    )
  }

  return arr
})

/* ---------- Form actions ---------- */
function resetForm() {
  editingId.value = null
  form.value = {
    name: '',
    description: '',
    rate: 48000,
    audioConfig: '7.1',
    path_eq: '',
    order: ['FL','FR','FC','LFE','BL','BR','SL','SR']
  }
  newChannel.value = 'FL'
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
  form.value.audioConfig = String(cfg.config ?? '7.1') as any
  form.value.path_eq = String(cfg.path_eq ?? '')
  form.value.order = Array.isArray(cfg.order) ? [...cfg.order] : ['FL','FR','FC','LFE','BL','BR','SL','SR']
  showForm.value = true
}

function removeChannel(i: number) {
  form.value.order.splice(i, 1)
}
function addChannel() {
  const ch = newChannel.value
  if (!ch) return
  if (!form.value.order.includes(ch)) form.value.order.push(ch)
}

async function save() {
  if (!form.value.name.trim()) {
    toast?.add?.({ title: 'Nom requis', color: 'error' })
    return
  }

  const payload = {
    name: form.value.name.trim(),
    description: form.value.description || '',
    // tu stockes ce JSON dans eq.config
    config: {
      rate: Number(form.value.rate || 48000),
      config: form.value.audioConfig,
      path_eq: form.value.path_eq || '',
      order: form.value.order
    }
  }

  try {
    saving.value = true
    if (editingId.value) {
      await updatePreset(editingId.value, payload)
      toast?.add?.({ title: 'Preset modifié', color: 'success' })
    } else {
      await createPreset(payload)
      toast?.add?.({ title: 'Preset créé', color: 'success' })
    }
    showForm.value = false
    await fetchPresets()
  } catch (e: any) {
    console.error(e)
    toast?.add?.({ title: 'Sauvegarde impossible', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function onDelete(id: number) {
  if (!confirm(`Supprimer le preset EQ #${id} ?`)) return
  try {
    await deletePreset(id)
    toast?.add?.({ title: 'Supprimé', color: 'green' })
    await fetchPresets()
  } catch (e: any) {
    console.error(e)
    toast?.add?.({ title: 'Suppression impossible', color: 'error' })
  }
}

onMounted(fetchPresets)
</script>

<template>
  <div class="flex flex-col gap-6 pb-10 px-3 sm:px-4 lg:px-6">
    <!-- HEADER -->
    <div class="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 pt-4 pb-3">
      <UDashboardNavbar class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default" style="height: 80px;">
        <template #left>
          <UPageCard
            title="EQ Presets"
            description="Gestion des presets d’égalisation (DB eq)."
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

            <UButton icon="i-lucide-plus" color="primary" @click="openCreate">
              Nouveau
            </UButton>

            <UButton icon="i-lucide-refresh-ccw" color="neutral" :loading="loading" @click="fetchPresets">
              Rafraîchir
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </div>

    <!-- ALERTES -->
    <UAlert v-if="errorMsg" color="red" :title="errorMsg" />
    <UAlert v-else-if="!loading && !presets.length" color="neutral" title="Aucun preset EQ en base." />

    <!-- FILTRES -->
    <UPageCard variant="subtle" :ui="{ container: 'p-3 sm:p-4 gap-y-0', wrapper: 'items-stretch' }">
      <div class="flex flex-col md:flex-row gap-3 md:items-center">
        <div class="flex-1">
          <UInput
            v-model="q"
            icon="i-lucide-search"
            placeholder="Rechercher par nom, description, id…"
            :disabled="loading || !presets.length"
          />
        </div>

        <div class="flex flex-wrap gap-2 items-center text-xs">
          <span class="text-dimmed">Config</span>
          <!-- Version v4: USelect avec :items -->
          <USelect v-model="cfgFilter" :items="filterItems" class="min-w-[140px]" />
        </div>

        <div class="text-xs text-dimmed md:ms-auto">
          {{ filteredPresets.length }} preset(s) affiché(s)
        </div>
      </div>
    </UPageCard>

    <!-- FORM inline (create/edit) -->
    <UCard v-if="showForm" class="max-w-4xl mx-auto" :ui="{ body: 'space-y-4' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="size-5" />
          <h3 class="font-semibold">
            {{ editingId ? `Modifier preset #${editingId}` : 'Nouveau preset EQ' }}
          </h3>
          <UButton class="ms-auto" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="showForm = false" />
        </div>
      </template>

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
          <UInput v-model.number="form.rate" type="number" placeholder="48000" class="mt-1" />
        </div>

        <div>
          <label class="text-sm text-dimmed">Configuration</label>
          <!-- v4: items -->
          <USelect v-model="form.audioConfig" :items="audioConfigItems" class="mt-1" />
        </div>

        <div class="md:col-span-2">
          <label class="text-sm text-dimmed">Fichier EQ</label>
          <UInput v-model="form.path_eq" placeholder="Cuisine_spotify_EQ.json" class="mt-1" />
        </div>

        <div class="md:col-span-2">
          <label class="text-sm text-dimmed mb-1 block">Ordre des canaux</label>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="(ch, i) in form.order"
              :key="`${ch}-${i}`"
              variant="subtle"
              class="cursor-pointer"
              @click="removeChannel(i)"
            >
              {{ ch }} ✕
            </UBadge>
          </div>

          <div class="flex gap-2 mt-2 items-center">
            <USelect v-model="newChannel" :items="channelItems" class="min-w-[120px]" />
            <UButton size="xs" @click="addChannel">Ajouter</UButton>
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

    <!-- LISTE DES PRESETS -->
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
      <UPageCard
        v-for="p in filteredPresets"
        :key="p.id"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-3' }"
      >
        <!-- Header preset -->
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-equalizer" style="height: 28px; width: 28px;" />
              <span class="font-medium text-base truncate">
                {{ p.name || 'Sans nom' }}
              </span>
              <UBadge variant="subtle" class="text-[10px]">
                {{ getAudioConfig(p) }}
              </UBadge>
            </div>
            <div class="text-xs text-dimmed truncate">
              {{ p.description || 'Aucune description' }}
            </div>
          </div>

          <div class="flex flex-col items-end gap-1 text-[10px]">
            <span class="text-dimmed">ID #{{ p.id }}</span>
            <div class="flex gap-2 mt-1">
              <UButton size="xs" variant="ghost" color="neutral" @click="openEdit(p)">Éditer</UButton>
              <UButton size="xs" variant="ghost" color="red" @click="onDelete(p.id)">Supprimer</UButton>
            </div>
          </div>
        </div>

        <!-- Infos lisibles (pas de JSON brut) -->
        <div class="grid grid-cols-2 gap-3 text-[11px] mt-2">
          <div class="space-y-1">
            <div class="text-dimmed">Rate</div>
            <div class="font-mono">{{ getRate(p) }}</div>
          </div>

          <div class="space-y-1">
            <div class="text-dimmed">Canaux</div>
            <div class="font-mono">{{ getChannelsCount(p) }}</div>
          </div>

          <div class="space-y-1 col-span-2">
            <div class="text-dimmed">Fichier</div>
            <div class="font-mono truncate">{{ getPathEq(p) }}</div>
          </div>
        </div>
      </UPageCard>
    </div>
  </div>
</template>
