<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getLecteurs,
  deleteLecteur,
  startLecteur,
  stopLecteur,
  postSpotifyUrl,
  type Lecteur
} from '@/src/api/lecteur'
import LecteurCreateModal from '@/components/lecteur/LecteurCreateModal.vue'

const toast = useToast()

/* Modale de création (tout le flux passe par là) */
const isNewOpen = ref(false)

const lecteurs = ref<Lecteur[]>([])
const loading = ref(true)
const errorMsg = ref<string | null>(null)

const q = ref('')
const typeFilter = ref<'all' | string>('all')

async function fetchLecteurs() {
  try {
    loading.value = true
    errorMsg.value = null
    lecteurs.value = await getLecteurs()
  } catch {
    errorMsg.value = 'Impossible de charger les lecteurs.'
    toast.add({ title: 'Erreur', description: errorMsg.value, color: 'error' })
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  let arr = [...lecteurs.value]
  if (typeFilter.value !== 'all') arr = arr.filter(l => l.type === typeFilter.value)

  const s = q.value.trim().toLowerCase()
  if (s) {
    arr = arr.filter(l =>
      String(l.id).includes(s) ||
      (l.name || '').toLowerCase().includes(s) ||
      (l.type || '').toLowerCase().includes(s)
    )
  }
  return arr
})

async function onDelete(id: number) {
  if (!confirm(`Supprimer le lecteur #${id} ?`)) return
  try {
    await deleteLecteur(id)
    await fetchLecteurs()
    toast.add({ title: 'Supprimé', color: 'success' })
  } catch {
    toast.add({ title: 'Suppression impossible', color: 'error' })
  }
}

function getStreamType(l: Lecteur) {
  return (l.config as any)?.typeStream || 'n/a'
}
function getInitialVolume(l: Lecteur): number | 'n/a' {
  const v = (l.config as any)?.['initial-volume']
  if (v === undefined || v === null || v === '') return 'n/a'
  const n = Number(v)
  return Number.isFinite(n) ? n : 'n/a'
}
function getAudioConfig(l: Lecteur) {
  return l.conf_eq?.config || (l.config as any)?.StreamOutFifo?.config || 'n/a'
}
function getChannels(l: Lecteur) {
  const eqOrderLen = l.conf_eq?.order?.length
  if (eqOrderLen) return eqOrderLen
  return (l.config as any)?.StreamOutFifo?.channels ?? 'n/a'
}
function isRunning(l: Lecteur) {
  return !!l.isStart?.alive
}

/** État du token d'auth (null si le lecteur n'en a pas) */
function tokenInfo(l: Lecteur): { label: string; color: 'success' | 'warning' | 'error'; icon: string; expires?: string } | null {
  const t = l.token
  if (!t) return null
  const expired = t.expiresAt != null && t.expiresAt < Date.now()
  const expires = t.expiresAt != null ? new Date(t.expiresAt).toLocaleString() : undefined
  if (!t.connected) return { label: 'Déconnecté', color: 'error', icon: 'i-lucide-unplug', expires }
  if (expired)      return { label: 'Expiré',      color: 'warning', icon: 'i-lucide-clock-alert', expires }
  if (!t.verified)  return { label: 'Non vérifié', color: 'warning', icon: 'i-lucide-shield-alert', expires }
  return { label: 'Connecté', color: 'success', icon: 'i-lucide-shield-check', expires }
}

async function onStart(id: number) {
  try {
    await startLecteur(id)
    toast.add({ title: 'Lecteur démarré', color: 'success' })
    await fetchLecteurs()
  } catch {
    toast.add({ title: 'Start impossible', color: 'error' })
  }
}
async function onStop(id: number) {
  try {
    await stopLecteur(id)
    toast.add({ title: 'Lecteur stoppé', color: 'secondary' })
    await fetchLecteurs()
  } catch {
    toast.add({ title: 'Stop impossible', color: 'error' })
  }
}
async function onPostUrl(url: string, name: string) {
  try {
    await postSpotifyUrl(url, name)
    toast.add({ title: 'URL envoyée', color: 'success' })
  } catch {
    toast.add({ title: 'Envoi impossible', color: 'error' })
  }
}

onMounted(fetchLecteurs)
</script>

<template>
  <div class="flex flex-col min-h-0 flex-1">
    <UDashboardNavbar class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default" style="height: 120px;">
      <template #leading>
        <UPageCard
          title="Lecteurs"
          :description="`Total: ${lecteurs.length} • Actifs: ${lecteurs.filter(l => l.isStart?.alive).length}`"
          variant="naked"
          orientation="horizontal"
          :ui="{ container: 'p-4 sm:p-4 gap-3' }"
          class="mb-0 flex items-center"
        />
      </template>

      <template #right>
        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-plus" color="primary" @click="isNewOpen = true">Nouveau</UButton>
          <UButton icon="i-lucide-refresh-ccw" color="neutral" :loading="loading" @click="fetchLecteurs">Rafraîchir</UButton>
        </div>
      </template>
    </UDashboardNavbar>

    <main class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8">
      <div class="w-full lg:max-w-12xl py-6 sm:py-8 lg:py-10 space-y-4">
        <UAlert v-if="errorMsg" color="error" :title="errorMsg" />
        <UPageCard variant="subtle" :ui="{ container: 'p-3' }">
          <div class="flex flex-col md:flex-row gap-3 md:items-center">
            <div class="flex-1">
              <UInput v-model="q" icon="i-lucide-search" placeholder="Rechercher..." />
            </div>
            <div class="flex gap-2 items-center text-xs">
              <span class="text-dimmed">Type</span>
              <UButton size="2xs" variant="ghost" :color="typeFilter==='all'?'primary':'neutral'" @click="typeFilter='all'">Tous</UButton>
              <UButton size="2xs" variant="ghost" :color="typeFilter==='spotify'?'primary':'neutral'" @click="typeFilter='spotify'">Spotify</UButton>
              <UButton size="2xs" variant="ghost" :color="typeFilter==='deezer'?'primary':'neutral'" @click="typeFilter='deezer'">Deezer</UButton>
            </div>
          </div>
        </UPageCard>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UPageCard v-for="l in filtered" :key="l.id" variant="subtle" :ui="{ container: 'p-4 gap-y-2' }">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium truncate">{{ l.name || 'Sans nom' }}</span>
                  <UBadge variant="subtle" class="text-[10px]">{{ l.type || 'n/a' }}</UBadge>
                  <UBadge :color="isRunning(l) ? 'primary' : 'neutral'" variant="subtle" class="text-[10px]">
                    {{ isRunning(l) ? 'Actif' : 'Arrêté' }}
                  </UBadge>
                  <UTooltip v-if="tokenInfo(l)" :text="tokenInfo(l)?.expires ? `Expire : ${tokenInfo(l)?.expires}` : ''">
                    <UBadge :color="tokenInfo(l)!.color" variant="subtle" class="text-[10px]" :icon="tokenInfo(l)!.icon">
                      {{ tokenInfo(l)!.label }}
                    </UBadge>
                  </UTooltip>
                </div>

                <div class="text-xs text-dimmed font-mono">stream: {{ getStreamType(l) }}</div>

                <div class="text-xs text-dimmed mt-1">
                  EQ:
                  <span v-if="l.conf_eq" class="font-mono">
                    {{ l.conf_eq.config }} · {{ l.conf_eq.rate }}Hz · {{ l.conf_eq.order?.length || '?' }}ch
                  </span>
                  <span v-else class="text-dimmed">désactivé</span>
                  <div v-if="l.url?.length" class="text-xs text-dimmed mt-1">
                    URL:
                    <a v-for="(u, i) in l.url" :key="i" :href="u.url" class="font-mono block">
                      {{ u.type }}
                    </a>
                    <input
                      v-if="l.type === 'spotify'"
                      type="text"
                      placeholder="Ajouter URL Spotify"
                      class="mt-1 w-full text-xs"
                      @keyup.enter="onPostUrl(($event.target as HTMLInputElement).value, (l.config as any).name); ($event.target as HTMLInputElement).value = ''"
                    />
                  </div>
                </div>
              </div>

              <div class="flex flex-col items-end gap-2">
                <UButton :to="`/lecteurs/${l.id}`" size="xs" variant="ghost" color="neutral">Éditer</UButton>
                <UButton size="xs" color="red" variant="ghost" @click="onDelete(l.id)">Supprimer</UButton>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[11px] text-dimmed mt-2">
              <div>
                <span class="font-semibold">Volume initial</span><br />
                <span class="font-mono">
                  <template v-if="getInitialVolume(l) === 'n/a'">n/a</template>
                  <template v-else>{{ getInitialVolume(l) }}%</template>
                </span>
              </div>
              <div>
                <span class="font-semibold">Config audio</span><br />
                <span class="font-mono">{{ getAudioConfig(l) }}</span>
              </div>
              <div>
                <span class="font-semibold">Canaux</span><br />
                <span class="font-mono">{{ getChannels(l) }}</span>
              </div>
              <div>
                <span class="font-semibold">ID</span><br />
                <span class="font-mono">#{{ l.id }}</span>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 mt-3">
              <UButton v-if="!isRunning(l)" class="px-2 p-1" size="xs" color="primary" variant="subtle" @click="onStart(l.id)">
                Start
              </UButton>
              <UButton v-else class="px-2 p-1" size="xs" color="primary" variant="subtle" @click="onStop(l.id)">
                Stop
              </UButton>
            </div>
          </UPageCard>
        </div>
      </div>
    </main>

    <!-- Création (choix du type + formulaire) -->
    <LecteurCreateModal v-model:open="isNewOpen" @created="fetchLecteurs" />
  </div>
</template>
