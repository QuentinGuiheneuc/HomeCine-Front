<script setup lang="ts">
import { useLecteursWs } from '@/composables/useLecteursWs'

const { isLecteurSlideoverOpen, activeLecteurId } = useDashboard()
const ws = useLecteursWs()
const toast = useToast()

/** Types gérant une file (réinitialisable via Lecteur.ClearQueue) */
const QUEUE_TYPES = ['fileplayer', 'youtube', 'deezer']
const canReset = (type?: string) => QUEUE_TYPES.includes((type ?? '').toLowerCase())

/** Réinitialise le lecteur : vide la file ET stoppe la lecture */
function resetLecteur(id: number) {
  if (!confirm('Réinitialiser le lecteur ? La file est vidée et la lecture en cours s\'arrête.')) return
  if (!ws.clearQueue(id)) { toast.add({ title: 'WS non connecté', color: 'error' }); return }
  ws.getQueue(id)
}

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n))

/* ── Volume par lecteur (local optimiste) ───────────────────────────────── */
const volumeById = ref<Record<number, number>>({})

function getVolume(id: number) {
  return ws.lecteurs.value.find(l => l.id === id)?.volume
}

const _setVolumeDebounced = useDebounceFn((id: number, value: number) => {
  ws.setVolume(id, clamp(value))
}, 200)

function setVolume(id: number, pct: number) {
  volumeById.value = { ...volumeById.value, [id]: clamp(pct) }
  _setVolumeDebounced(id, clamp(pct))
}

function onWheelVolume(id: number, e: WheelEvent) {
  const step  = e.shiftKey ? 10 : 5
  const delta = e.deltaY > 0 ? -step : step
  const next  = clamp(getVolume(id) + delta)
  if (next !== getVolume(id)) setVolume(id, next)
  e.preventDefault()
}

/* ── Sélection du lecteur principal ────────────────────────────────────── */
function selectLecteur(id: number) {
  const next = activeLecteurId.value === id ? null : id
  activeLecteurId.value = next
  if (next !== null) ws.cmd('Set.select', { id: next })
}

/* ── Icône par type ─────────────────────────────────────────────────────── */
function iconForType(type: string) {
  switch ((type ?? '').toLowerCase()) {
    case 'spotify':      return 'mdi:spotify'
    case 'fileplayer':   return 'mdi:file-music'
    case 'controlinput': return 'mdi:audio-input-rca'
    default:             return 'i-lucide-music'
  }
}
</script>

<template>
  <USlideover
    v-model:open="isLecteurSlideoverOpen"
    title="Lecteurs"
    :ui="{ content: 'max-w-1x4 w-screen', header: 'px-3 py-5', body: 'px-0 py-0', footer: 'px-6 py-5' }"
  >
    <template #body>

      <!-- ── Barre de statut ────────────────────────────────────────────── -->
      <div class="px-6 py-3 border-b border-default flex items-center justify-between">
        <div class="text-sm text-dimmed">
          {{ ws.lecteurs.value.length }} lecteur{{ ws.lecteurs.value.length > 1 ? 's' : '' }}
          <span v-if="activeLecteurId != null" class="ml-2 text-primary">
            · Principal : #{{ activeLecteurId }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <UBadge
            :color="ws.wsStatus.value === 'connected' ? 'success' : 'error'"
            variant="subtle"
            size="xs"
          >
            {{ ws.wsStatus.value }}
          </UBadge>
          <UButton
            size="xs" variant="ghost" color="neutral"
            icon="i-lucide-refresh-ccw"
            @click="ws.getState()"
          >
            Refresh
          </UButton>
        </div>
      </div>

      <!-- ── Liste des lecteurs ─────────────────────────────────────────── -->
      <div class="p-2">

        <div v-if="ws.lecteurs.value.length === 0" class="px-3 py-6 text-sm text-dimmed text-center">
          Aucun lecteur disponible
        </div>

        <div
          v-for="l in ws.lecteurs.value"
          :key="l.id"
          class="px-3 py-3 rounded-md hover:bg-elevated/50 flex items-center gap-4 transition-colors"
          :class="{ 'ring-1 ring-primary/40 bg-primary/5': activeLecteurId === l.id }"
        >
          <!-- Icône -->
          <UAvatar :icon="iconForType(l.device_type ?? l.type)" size="xl" class="shrink-0" />

          <!-- Infos -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="truncate text-base font-medium">{{ l.name }}</p>

              <UBadge v-if="activeLecteurId === l.id" color="primary"  variant="subtle" size="xs">Principal</UBadge>
              <UBadge v-if="l.playing"  color="success" variant="subtle" size="xs">Lecture</UBadge>
              <UBadge v-else            color="neutral" variant="subtle" size="xs">Arrêté</UBadge>
              <UBadge v-if="!l.alive"                  color="error"    variant="subtle" size="xs">Hors ligne</UBadge>
            </div>

            <!-- Piste en cours -->
            <p v-if="l.track?.title" class="text-xs text-dimmed truncate mt-0.5">
              <UIcon name="i-lucide-music" class="inline w-3 h-3 mr-1" />
              {{ l.track.title }}
              <span v-if="l.track.artists?.length"> · {{ l.track.artists.join(', ') }}</span>
            </p>
            <p v-else class="text-xs text-dimmed mt-0.5">{{ l.type }} · Aucune piste</p>

            <!-- Slider volume -->
            <div class="mt-2 flex items-center gap-2 max-w-sm">
              <UIcon
                :name="getVolume(l.id) === 0 ? 'i-lucide-volume-x' : getVolume(l.id) < 50 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'"
                class="w-4 h-4 shrink-0"
              />
              <input
                type="range" min="0" max="100"
                :value="getVolume(l.id)"
                class="w-full accent-current h-1.5 range-primary-0"
                @input="setVolume(l.id, ($event.target as HTMLInputElement).valueAsNumber)"
                @wheel.prevent="onWheelVolume(l.id, $event)"
              />
              <span class="text-xs tabular-nums w-10 text-right">{{ getVolume(l.id) }}%</span>
            </div>
          </div>

          <!-- Boutons : Réinitialiser (au-dessus) + sélection -->
          <div class="flex flex-col items-stretch gap-1 shrink-0">
            <UButton
              v-if="canReset(l.type)"
              label="Réinitialiser"
              icon="i-lucide-rotate-ccw"
              color="error" variant="ghost" size="sm"
              title="Vide la file et stoppe la lecture"
              @click="resetLecteur(l.id)"
            />
            <UButton
              :label="activeLecteurId === l.id ? 'Principal' : 'Utiliser'"
              :color="activeLecteurId === l.id ? 'primary' : 'neutral'"
              :variant="activeLecteurId === l.id ? 'solid' : 'outline'"
              size="sm"
              @click="selectLecteur(l.id)"
            />
          </div>
        </div>

      </div>
    </template>
  </USlideover>
</template>
