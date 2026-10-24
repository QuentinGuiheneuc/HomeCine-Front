<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getFifos, type Fifo } from '@/src/api/fifo'

/**
 * Choix du FIFO de sortie : bouton + UModal listant les FIFO déclarés (GET /fifo).
 * Pas de saisie libre — les chemins se déclarent dans Réglages → FIFO.
 *
 * Deux v-model, parce que les deux transports ne stockent pas la même chose :
 *  - `modelValue` = le CHEMIN, ce que `localStream` enregistre ;
 *  - `fifoId` = l'ID, seul champ que le serveur retient pour `StreamOutFifo`
 *    (POST/PUT /lecteur ignorent les champs résolus qu'on lui renverrait).
 * Choisir un FIFO renseigne les deux : l'appelant lit celui qui le concerne.
 */
const model = defineModel<string>({ default: '' })
const fifoId = defineModel<number | null>('fifoId', { default: null })

const fifos   = ref<Fifo[]>([])
const loading = ref(false)
const open    = ref(false)

async function load() {
  loading.value = true
  try { fifos.value = await getFifos() } catch { /* liste indisponible */ }
  finally { loading.value = false }
}

/** FIFO enregistré : par id s'il est connu, sinon par chemin (null si hors liste) */
const current = computed(() =>
  fifos.value.find(f => (fifoId.value != null ? f.id === fifoId.value : f.path === model.value)) ?? null
)

/* Les lecteurs anterieurs au passage a `fifo_id` ne portent qu'un chemin : la
   vue resolue remplit le format mais laisse `fifo_id` vide. Comme PUT /lecteur
   ne garde QUE ce champ, enregistrer un tel lecteur sans retoucher au FIFO lui
   ferait perdre sa sortie. On adopte donc l'id des que le chemin le designe. */
watch(current, (f) => {
  if (f && fifoId.value == null) fifoId.value = f.id
}, { immediate: true })

function choose(f: Fifo) {
  model.value = f.path
  fifoId.value = f.id
  open.value = false
}
function clear() {
  model.value = ''
  fifoId.value = null
  open.value = false
}

onMounted(load)
</script>

<template>
  <div class="space-y-1">
    <!-- Déclencheur : FIFO courant + accès aux réglages -->
    <div class="flex items-center gap-1.5">
    <UButton
      color="neutral" variant="outline" block
      class="flex-1 justify-between font-normal"
      :loading="loading"
      @click="open = true"
    >
      <span class="flex items-center gap-2 min-w-0">
        <UIcon name="i-lucide-file-audio" class="size-4 shrink-0" :class="model ? 'text-primary' : 'text-dimmed'" />
        <span v-if="current" class="truncate">{{ current.label || current.path }}</span>
        <span v-else-if="model" class="truncate font-mono text-xs">{{ model }}</span>
        <span v-else class="text-dimmed">Choisir un FIFO…</span>
      </span>
      <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed shrink-0" />
    </UButton>
      <UTooltip text="Gérer les FIFO">
        <UButton icon="i-lucide-settings-2" color="neutral" variant="soft" square to="/settings/fifo" />
      </UTooltip>
    </div>

    <!-- Infos sur la sélection -->
    <p v-if="current && !current.exists" class="text-[11px] text-warning">
      FIFO déclaré mais absent du disque — « Recréer les manquants » dans Réglages → FIFO.
    </p>
    <p v-else-if="current && !current.enabled" class="text-[11px] text-dimmed">
      FIFO non exposé comme stream Snapcast (désactivé).
    </p>
    <p v-else-if="model && !current && !loading" class="text-[11px] text-warning">
      Chemin hors liste — déclarez-le dans
      <NuxtLink to="/settings/fifo" class="underline">Réglages → FIFO</NuxtLink>.
    </p>

    <!-- Modal de sélection -->
    <UModal v-model:open="open" title="Choisir un FIFO">
      <template #content>
        <div class="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs text-dimmed">Tubes déclarés dans Réglages → FIFO.</p>
            <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="loading" @click="load" />
          </div>

          <div v-if="loading && !fifos.length" class="space-y-1">
            <USkeleton v-for="i in 3" :key="i" class="h-12 rounded-md" />
          </div>

          <p v-else-if="!fifos.length" class="text-sm text-dimmed italic py-3 text-center">
            Aucun FIFO déclaré —
            <NuxtLink to="/settings/fifo" class="text-primary underline">en créer un</NuxtLink>
          </p>

          <div v-else class="space-y-1 max-h-[55vh] overflow-y-auto">
            <button
              v-for="f in fifos" :key="f.id"
              class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors border"
              :class="f.path === model
                ? 'border-primary bg-primary/10'
                : 'border-default hover:bg-elevated/50'"
              @click="choose(f)"
            >
              <UIcon name="i-lucide-file-audio" class="size-4 shrink-0" :class="f.exists ? 'text-primary' : 'text-dimmed'" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ f.label || '—' }}</span>
                <span class="block truncate text-[11px] text-dimmed font-mono">{{ f.path }}</span>
                <span v-if="f.sampleformat" class="block truncate text-[11px] text-dimmed opacity-70">
                  {{ formatSampleformat(f.sampleformat) }}
                </span>
              </span>
              <UBadge v-if="!f.exists" color="warning" variant="subtle" size="xs">absent</UBadge>
              <UBadge v-else-if="!f.enabled" color="neutral" variant="subtle" size="xs">inactif</UBadge>
              <UIcon v-if="f.path === model" name="i-lucide-check" class="size-4 text-primary shrink-0" />
            </button>
          </div>

          <div class="flex items-center justify-between gap-2 border-t border-default pt-3">
            <div class="flex items-center gap-2">
              <UButton label="Aucun" color="neutral" variant="soft" icon="i-lucide-x" :disabled="!model" @click="clear" />
              <UButton
                label="Gérer les FIFO" color="neutral" variant="soft" icon="i-lucide-settings-2"
                to="/settings/fifo" @click="open = false"
              />
            </div>
            <UButton label="Fermer" color="neutral" variant="soft" @click="open = false" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
