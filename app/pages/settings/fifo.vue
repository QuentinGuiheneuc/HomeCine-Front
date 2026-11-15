<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getFifos, createFifo, updateFifo, ensureFifos, setFifoEnabled, deleteFifo,
  type Fifo, type FifoBits
} from '@/src/api/fifo'
import { syncSnap } from '@/src/api/snap'

definePageMeta({ middleware: 'admin' })

const toast   = useToast()
const pending = ref(false)
const fifos   = ref<Fifo[]>([])
const busy    = ref<string | null>(null)   // clé d'action en cours

async function load() {
  pending.value = true
  try { fifos.value = await getFifos() }
  catch { toast.add({ title: 'Chargement des FIFO impossible', color: 'error' }) }
  finally { pending.value = false }
}

/** Régénère snapserver.conf après toute modification */
async function resync() {
  try { await syncSnap() }
  catch { toast.add({ title: 'snapserver.conf non régénéré', description: 'POST /snap/sync a échoué', color: 'warning' }) }
}

const enabledCount = computed(() => fifos.value.filter(f => f.enabled).length)
const missingCount = computed(() => fifos.value.filter(f => !f.exists).length)

/* ── Édition (PUT /fifo/:id) ────────────────────────────────────────────── */
const editOpen = ref(false)
const editing = ref(false)
const editId = ref<number | null>(null)
const editPath = ref('')
const editLabel = ref('')
const editRate = ref<number | null>(null)
const editBits = ref<FifoBits | null>(null)
const editChannels = ref<number | null>(null)

function openEdit(f: Fifo) {
  editId.value = f.id
  editPath.value = f.path
  editLabel.value = f.label ?? ''
  editRate.value = f.rate ?? null
  editBits.value = f.bits ?? null
  editChannels.value = f.channels ?? null
  editOpen.value = true
}

async function onSaveEdit() {
  if (editId.value == null) return
  const path = editPath.value.trim()
  if (!path) {
    toast.add({ title: 'Chemin requis', color: 'warning' })
    return
  }
  editing.value = true
  try {
    await updateFifo(editId.value, {
      path,
      label: editLabel.value.trim() || undefined,
      rate: editRate.value ?? undefined,
      bits: editBits.value ?? undefined,
      channels: editChannels.value ?? undefined
    })
    toast.add({ title: 'FIFO modifié', description: path, color: 'success', icon: 'i-lucide-check' })
    editOpen.value = false
    await load()
    await resync()
  } catch {
    toast.add({ title: 'Modification impossible', color: 'error' })
  } finally {
    editing.value = false
  }
}

/* ── Création ───────────────────────────────────────────────────────────── */
const addOpen  = ref(false)
const addPath   = ref('')
const addLabel  = ref('')
const adding   = ref(false)

/* Le format s'écrit en trois champs distincts. `sampleformat` reste renvoyé
   par l'API, mais recomposé et en lecture seule : l'envoyer n'aurait aucun
   effet. Laisser les trois vides = format dérivé du lecteur, comme avant. */
const addRate = ref<number | null>(null)
const addBits = ref<FifoBits | null>(null)
const addChannels = ref<number | null>(null)

/** Un FIFO n'accepte que ces trois profondeurs ; `null` = dérivé du lecteur. */
const bitsItems: { label: string, value: FifoBits | null }[] = [
  { label: 'Dérivé du lecteur', value: null },
  { label: '16 bits', value: 16 },
  { label: '24 bits', value: 24 },
  { label: '32 bits', value: 32 }
]

function resetFormat() {
  addRate.value = null
  addBits.value = null
  addChannels.value = null
}

function openAdd() {
  addPath.value = '/tmp/spotify/'
  addLabel.value = ''
  resetFormat()
  addOpen.value = true
}

async function onCreate() {
  const path = addPath.value.trim()
  if (!path) { toast.add({ title: 'Chemin requis', color: 'warning' }); return }
  adding.value = true
  try {
    const res = await createFifo({
      path,
      label: addLabel.value.trim() || undefined,
      rate: addRate.value ?? undefined,
      bits: addBits.value ?? undefined,
      channels: addChannels.value ?? undefined
    })
    if (res.ok === false) {
      // 207 : référencé en base mais non créé sur le disque
      toast.add({
        title: 'FIFO référencé mais non créé',
        description: 'Le chemin est probablement occupé par un fichier ordinaire.',
        color: 'warning', icon: 'i-lucide-triangle-alert'
      })
    } else {
      toast.add({
        title: res.created === false ? 'FIFO déjà présent' : 'FIFO créé',
        description: path, color: 'success', icon: 'i-lucide-check'
      })
    }
    addOpen.value = false
    await load(); await resync()
  } catch (e: any) {
    toast.add({ title: 'Création impossible', description: apiError(e, 'Chemin ou libellé refusé'), color: 'error' })
  } finally { adding.value = false }
}

/* ── Actions ────────────────────────────────────────────────────────────── */
async function onToggle(f: Fifo, value: boolean) {
  busy.value = `en:${f.id}`
  try {
    await setFifoEnabled(f.id, value)
    f.enabled = value
    await resync()
    toast.add({ title: value ? 'Stream activé' : 'Stream désactivé', description: f.label || f.path, color: value ? 'success' : 'neutral' })
  } catch (e: any) {
    toast.add({ title: 'Modification impossible', description: apiError(e), color: 'error' })
  } finally { busy.value = null }
}

async function onEnsure() {
  busy.value = 'ensure'
  try {
    const res = await ensureFifos()
    if (Array.isArray(res?.fifos)) fifos.value = res.fifos
    else await load()
    await resync()
    toast.add({ title: 'FIFO recréés sur le disque', color: 'success', icon: 'i-lucide-wrench' })
  } catch { toast.add({ title: 'Opération impossible', color: 'error' }) }
  finally { busy.value = null }
}

async function onDelete(f: Fifo, withFile: boolean) {
  const what = withFile ? 'la référence ET le fichier' : 'la référence (fichier conservé)'
  if (!confirm(`Supprimer ${what} pour « ${f.label || f.path} » ?`)) return
  busy.value = `del:${f.id}`
  try {
    const res = await deleteFifo(f.id, withFile)
    await load(); await resync()
    if (withFile && res?.fileRemoved === false) {
      toast.add({ title: 'Référence supprimée', description: 'Fichier laissé : ce n’était plus un FIFO.', color: 'warning' })
    } else {
      toast.add({ title: 'FIFO supprimé', color: 'success' })
    }
  } catch (e: any) {
    toast.add({ title: 'Suppression impossible', description: apiError(e), color: 'error' })
  } finally { busy.value = null }
}

onMounted(load)
</script>

<template>
  <div>
    <UPageCard
      title="FIFO"
      description="Tubes nommés exposés comme streams Snapcast. Chemin absolu, sous /tmp ou data/."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Recréer les manquants" color="neutral" variant="soft" icon="i-lucide-wrench" :loading="busy === 'ensure'" @click="onEnsure" />
        <UButton label="Actualiser" color="neutral" icon="i-lucide-refresh-cw" :loading="pending" @click="load" />
        <UButton label="Nouveau FIFO" color="primary" icon="i-lucide-plus" @click="openAdd" />
      </div>
    </UPageCard>

    <!-- Résumé -->
    <div class="grid gap-2 sm:grid-cols-3 mb-4">
      <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
        <p class="text-xs text-dimmed">Total</p>
        <p class="text-xl font-bold">{{ fifos.length }}</p>
      </UPageCard>
      <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
        <p class="text-xs text-dimmed">Exposés (streams)</p>
        <p class="text-xl font-bold text-primary">{{ enabledCount }}</p>
      </UPageCard>
      <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
        <p class="text-xs text-dimmed">Absents du disque</p>
        <p class="text-xl font-bold" :class="missingCount ? 'text-warning' : ''">{{ missingCount }}</p>
      </UPageCard>
    </div>

    <!-- Liste -->
    <div v-if="pending && !fifos.length" class="grid gap-2">
      <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
    </div>
    <UPageCard v-else-if="!fifos.length" variant="subtle" :ui="{ container: 'p-6' }">
      <p class="text-sm text-dimmed italic text-center">Aucun FIFO. Créez-en un pour l'exposer à Snapcast.</p>
    </UPageCard>

    <div v-else class="grid gap-2">
      <UPageCard v-for="f in fifos" :key="f.id" variant="subtle" :ui="{ container: 'p-4 gap-y-2' }">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-file-audio" class="size-6 shrink-0" :class="f.exists ? 'text-primary' : 'text-dimmed'" />

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0">
              <p class="font-semibold truncate">{{ f.label || '—' }}</p>
              <UBadge
                :color="f.exists ? 'success' : 'warning'" variant="subtle" size="xs"
                :icon="f.exists ? 'i-lucide-check' : 'i-lucide-triangle-alert'"
              >
                {{ f.exists ? 'sur le disque' : 'absent' }}
              </UBadge>
            </div>
            <p class="text-xs text-dimmed font-mono truncate">{{ f.path }}</p>
            <p v-if="f.sampleformat" class="text-[11px] text-dimmed mt-0.5">
              <span class="font-mono">{{ f.sampleformat }}</span>
              <span class="opacity-60"> · {{ formatSampleformat(f.sampleformat) }}</span>
            </p>
          </div>

          <!-- Exposition en stream -->
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-dimmed hidden sm:inline">Stream</span>
            <USwitch
              :model-value="f.enabled"
              :disabled="busy === `en:${f.id}`"
              @update:model-value="(v) => onToggle(f, v)"
            />
          </div>

          <UDropdownMenu
            :items="[[
              { label: 'Modifier',               icon: 'i-lucide-pencil',  onSelect: () => openEdit(f) },
              { label: 'Supprimer la référence', icon: 'i-lucide-unlink',  onSelect: () => onDelete(f, false) },
              { label: 'Supprimer + fichier',    icon: 'i-lucide-trash-2', onSelect: () => onDelete(f, true) }
            ]]"
          >
            <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" square :loading="busy === `del:${f.id}`" />
          </UDropdownMenu>
        </div>
      </UPageCard>
    </div>

    <!-- Modal création -->
    <UModal v-model:open="addOpen" title="Nouveau FIFO">
      <template #content>
        <div class="p-6 space-y-4">
          <UFormField label="Chemin" description="Absolu, sous /tmp ou data/ — sans ? & # ni retour à la ligne.">
            <UInput v-model="addPath" placeholder="/tmp/spotify/salon.fifo" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Libellé" description="Optionnel — conserve l'existant s'il est omis.">
            <UInput v-model="addLabel" placeholder="Salon" class="w-full" />
          </UFormField>
          <UFormField label="Format" description="Laisser vide pour le dériver du lecteur.">
            <div class="grid grid-cols-3 gap-2">
              <UInput
                v-model.number="addRate"
                type="number"
                placeholder="48000"
                class="font-mono"
              />
              <USelect
                v-model="addBits"
                :items="bitsItems"
                class="font-mono"
              />
              <UInput
                v-model.number="addChannels"
                type="number"
                placeholder="8"
                class="font-mono"
              />
            </div>
            <div class="grid grid-cols-3 gap-2 text-[11px] text-dimmed mt-1">
              <span>Débit (Hz)</span>
              <span>Bits</span>
              <span>Canaux</span>
            </div>
            <p v-if="formatFifoFormat({ rate: addRate, bits: addBits, channels: addChannels })" class="text-[11px] text-dimmed mt-1">
              {{ formatFifoFormat({ rate: addRate, bits: addBits, channels: addChannels }) }}
            </p>
          </UFormField>
          <div class="flex items-center justify-end gap-2 border-t border-default pt-3">
            <UButton label="Annuler" color="neutral" variant="soft" @click="addOpen = false" />
            <UButton label="Créer" icon="i-lucide-plus" color="primary" :loading="adding" :disabled="!addPath.trim()" @click="onCreate" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal édition -->
    <UModal v-model:open="editOpen" title="Modifier le FIFO">
      <template #content>
        <div class="p-6 space-y-4">
          <UFormField label="Chemin" description="Absolu, sous /tmp ou data/.">
            <UInput
              v-model="editPath"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField label="Libellé">
            <UInput
              v-model="editLabel"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Format" description="Débit, profondeur et canaux du flux.">
            <div class="grid grid-cols-3 gap-2">
              <UInput
                v-model.number="editRate"
                type="number"
                placeholder="48000"
                class="font-mono"
              />
              <USelect
                v-model="editBits"
                :items="bitsItems"
                class="font-mono"
              />
              <UInput
                v-model.number="editChannels"
                type="number"
                placeholder="8"
                class="font-mono"
              />
            </div>
            <div class="grid grid-cols-3 gap-2 text-[11px] text-dimmed mt-1">
              <span>Débit (Hz)</span>
              <span>Bits</span>
              <span>Canaux</span>
            </div>
            <p v-if="formatFifoFormat({ rate: editRate, bits: editBits, channels: editChannels })" class="text-[11px] text-dimmed mt-1">
              {{ formatFifoFormat({ rate: editRate, bits: editBits, channels: editChannels }) }}
            </p>
          </UFormField>
          <div class="flex items-center justify-end gap-2 border-t border-default pt-3">
            <UButton
              label="Annuler"
              color="neutral"
              variant="soft"
              @click="editOpen = false"
            />
            <UButton
              label="Enregistrer"
              icon="i-lucide-save"
              color="primary"
              :loading="editing"
              :disabled="!editPath.trim()"
              @click="onSaveEdit"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
