<script setup lang="ts">
import { useLecteursWs } from '@/composables/useLecteursWs'
import type { QueueItem } from '@/types/lecteur'

const { isQueueSlideoverOpen, activeLecteurId } = useDashboard()
const ws = useLecteursWs()

/* ── Lecteur actif ──────────────────────────────────────────────────────── */

const activeLecteur = computed(() => {
  const list = ws.lecteurs.value
  if (activeLecteurId.value != null) {
    const sel = list.find(l => l.id === activeLecteurId.value)
    if (sel) return sel
  }
  return list.find(l => l.playing) ?? list[0] ?? null
})

/* ── File d'attente ─────────────────────────────────────────────────────── */

const queue    = computed<QueueItem[]>(() =>
  activeLecteur.value ? (ws.queuesById.value[activeLecteur.value.id] ?? []) : []
)
const loading  = ref(false)

async function fetchQueue() {
  const id = activeLecteur.value?.id
  if (id == null) return
  loading.value = true
  ws.getQueue(id)
  await new Promise(r => setTimeout(r, 600))
  loading.value = false
}

watch(isQueueSlideoverOpen, open => {
  if (!open) return
  const id = activeLecteur.value?.id
  // Si la queue est déjà présente (venue du Init), pas besoin de refetch
  if (id != null && ws.queuesById.value[id]) return
  fetchQueue()
})

/* ── Helpers ────────────────────────────────────────────────────────────── */

function toTime(ms: number) {
  const s  = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function playItem(item: QueueItem) {
  ws.play(activeLecteur.value?.id, item.uri)
}
</script>

<template>
  <USlideover
    v-model:open="isQueueSlideoverOpen"
    title="File d'attente"
    :ui="{ content: 'max-w-1x4 w-screen', header: 'px-3 py-5', body: 'px-0 py-0', footer: 'px-6 py-5' }"
  >
    <template #body>

      <!-- ── Barre de statut ────────────────────────────────────────────── -->
      <div class="px-6 py-3 border-b border-default flex items-center justify-between">
        <div class="text-sm text-dimmed">
          <span v-if="activeLecteur">
            <UIcon :name="activeLecteur.playing ? 'i-lucide-music' : 'i-lucide-pause'" class="inline w-3.5 h-3.5 mr-1" />
            {{ activeLecteur.name }}
          </span>
          <span v-else class="italic">Aucun lecteur</span>
          <span class="ml-2">· {{ queue.length }} piste{{ queue.length > 1 ? 's' : '' }}</span>
        </div>
        <UButton
          size="xs" variant="ghost" color="neutral"
          icon="i-lucide-refresh-ccw"
          :loading="loading"
          @click="fetchQueue"
        >
          Refresh
        </UButton>
      </div>

      <!-- ── Piste en cours ─────────────────────────────────────────────── -->
      <div v-if="activeLecteur?.track" class="px-4 py-3 border-b border-default bg-elevated/30">
        <p class="text-[10px] text-dimmed uppercase tracking-wider mb-2">En cours</p>
        <div class="flex items-center gap-3">
          <img
            v-if="activeLecteur.track.cover_url"
            :src="activeLecteur.track.cover_url"
            class="h-12 w-12 rounded object-cover shrink-0"
          />
          <div class="w-12 h-12 rounded bg-elevated flex items-center justify-center shrink-0" v-else>
            <UIcon name="i-lucide-music" class="w-5 h-5 text-dimmed" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ activeLecteur.track.title ?? '—' }}</p>
            <p class="truncate text-xs text-dimmed">{{ (activeLecteur.track.artists ?? []).join(', ') || '—' }}</p>
            <p v-if="activeLecteur.track.album" class="truncate text-[10px] text-muted">{{ activeLecteur.track.album }}</p>
          </div>
          <span class="text-xs tabular-nums text-dimmed shrink-0 ml-auto">
            {{ activeLecteur.track.duration_ms ? toTime(activeLecteur.track.duration_ms) : '—' }}
          </span>
        </div>
      </div>

      <!-- ── Liste queue ────────────────────────────────────────────────── -->
      <div class="p-2">

        <!-- Loading -->
        <div v-if="loading && queue.length === 0" class="px-3 py-6 flex justify-center">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-2xl text-dimmed" />
        </div>

        <!-- Vide -->
        <div v-else-if="!loading && queue.length === 0" class="px-3 py-6 text-sm text-dimmed text-center">
          <UIcon name="i-lucide-list-x" class="w-8 h-8 mx-auto mb-2 opacity-40" />
          File d'attente vide
        </div>

        <!-- Items -->
        <div
          v-for="(item, index) in queue"
          :key="item.uri + index"
          class="px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-center gap-3 group transition-colors"
        >
          <!-- Numéro / cover -->
          <div class="relative shrink-0">
            <img
              v-if="item.cover_url"
              :src="item.cover_url"
              class="h-10 w-10 rounded object-cover"
            />
            <div v-else class="h-10 w-10 rounded bg-elevated flex items-center justify-center">
              <span class="text-xs text-dimmed tabular-nums">{{ index + 1 }}</span>
            </div>
            <!-- Overlay play au hover -->
            <button
              class="absolute inset-0 rounded bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              @click="playItem(item)"
            >
              <UIcon name="i-lucide-play" class="w-4 h-4 text-white" />
            </button>
          </div>

          <!-- Infos -->
          <div class="flex-1 min-w-0">
            <p class="truncate text-sm font-medium">{{ item.title }}</p>
            <p class="truncate text-xs text-dimmed">
              {{ item.artists.join(', ') }}
              <span v-if="item.album"> · {{ item.album }}</span>
            </p>
          </div>

          <!-- Durée -->
          <span class="text-xs tabular-nums text-dimmed shrink-0">
            {{ toTime(item.duration_ms) }}
          </span>
        </div>

      </div>
    </template>
  </USlideover>
</template>
