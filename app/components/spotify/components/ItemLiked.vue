<script setup lang="ts">
import http from '@/src/lib/https'

/** Props : tenir compte du lecteur collé en bas */
const props = withDefaults(defineProps<{
  playerHeight?: number
}>(), {
  playerHeight: 104
})

/** Types du snapshot JSON côté API */
type SnapshotTrack = {
  id: string
  uri: string
  name: string
  artists: string[]
  album?: { id?: string; name?: string; image?: string | null }
  duration_ms?: number
}
type SnapshotPayload = {
  generated_at: string
  total: number
  items: SnapshotTrack[]
}

/** State */
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const generatedAt = ref<string | null>(null)

const all = ref<SnapshotTrack[]>([]) // tout le snapshot
const rows = ref<SnapshotTrack[]>([]) // fenêtre affichée
const page = reactive({ size: 50, start: 0, total: 0 })

/** Helpers */
const coverUrl = computed(() =>
  rows.value[0]?.album?.image ||
  'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#ec4899"/><stop offset="1" stop-color="#8b5cf6"/>
      </linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>
  `)
)
const ms = (v?: number) => {
  if (!v && v !== 0) return '0:00'
  const s = Math.floor(v / 1000), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

/** Fetch snapshot (GET) */
async function fetchSnapshot() {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await http.get<SnapshotPayload>('/spotify/me/tracks/sync-json')
    const data = (res as any).data ?? res

    generatedAt.value = data.generated_at || null
    all.value = data.items ?? []
    page.total = all.value.length
    page.start = 0
    rows.value = all.value.slice(0, page.size)
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Impossible de charger les Titres likés (snapshot)'
    all.value = []; rows.value = []; page.total = 0; page.start = 0
  } finally {
    loading.value = false
  }
}

/** Regénérer le snapshot (POST), puis relire (GET) */
async function regenerate() {
  loading.value = true
  errorMsg.value = null
  try {
    await http.post('/spotify/me/tracks/sync-json', {})
    await fetchSnapshot()
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Échec de la régénération'
  } finally {
    loading.value = false
  }
}

/** Charger plus (pagination locale) */
function loadMore() {
  if (loading.value) return
  const next = page.start + page.size
  if (next >= page.total) return
  const end = Math.min(next + page.size, page.total)
  rows.value.push(...all.value.slice(next, end))
  page.start = next
}

/** Actions Player */
async function playAll() {
  if (!all.value.length) return
  try {
    loading.value = true
    // joue toute la liste (URIs)
    await http.put('/spotify/devices/play', { uris: all.value.map(t => t.uri) })
  } finally {
    loading.value = false
  }
}
async function playAt(idx: number) {
  const slice = all.value.slice(idx).map(t => t.uri)
  if (!slice.length) return
  try {
    loading.value = true
    await http.put('/spotify/devices/play', { uris: slice })
  } finally {
    loading.value = false
  }
}

/** Suppression d’un titre liké (optionnel) */
async function removeTrack(t: SnapshotTrack) {
  try {
    loading.value = true
    await http.delete('/spotify/me/tracks', { data: { ids: [t.id] } })
    // MAJ locale
    const iAll = all.value.findIndex(x => x.id === t.id)
    if (iAll !== -1) all.value.splice(iAll, 1)
    const iRows = rows.value.findIndex(x => x.id === t.id)
    if (iRows !== -1) rows.value.splice(iRows, 1)
    page.total = all.value.length
  } finally {
    loading.value = false
  }
}

/** Mount */
onMounted(fetchSnapshot)
</script>

<template>
  <!-- h-full pour occuper la hauteur disponible, min-h-0 pour autoriser le scroll interne -->
  <div class="flex flex-col h-full min-h-0">
    <!-- Header (non scrollant) -->
    <div class="pb-3 shrink-0">
      <div class="flex items-center gap-4">
        <img :src="coverUrl" class="h-24 w-24 rounded object-cover" alt="" />
        <div>
          <h1 class="text-xl font-semibold">Titres likés</h1>
          <p class="text-sm text-dimmed">
            {{ page.total }} titres
            <span v-if="generatedAt" class="text-xs"> · snapshot {{ new Date(generatedAt).toLocaleString() }}</span>
          </p>
          <div class="mt-2 flex items-center gap-2">
            <UButton icon="i-lucide-play" :loading="loading" @click="playAll">Lire tout</UButton>
            <UButton icon="i-lucide-rotate-ccw" variant="soft" :loading="loading" @click="regenerate">
              Régénérer
            </UButton>
          </div>
        </div>
      </div>
      <UAlert v-if="errorMsg" color="red" class="mt-3" :title="errorMsg" />
    </div>

    <!-- Liste scrollable -->
    <div
      class="flex-1 min-h-0 overflow-y-auto rounded-md border border-default divide-y divide-default"
      :style="{ paddingBottom: (playerHeight ?? 104) + 'px' }"
    >
      <div v-if="!loading && !rows.length" class="p-3 text-sm text-dimmed">Aucun titre.</div>

      <div
        v-for="(t, idx) in rows"
        :key="t.id"
        class="group flex items-center gap-3 p-2 hover:bg-elevated/40"
        @dblclick="playAt(idx)"
      >
        <span class="w-8 text-center text-xs tabular-nums text-dimmed">{{ idx + 1 }}</span>

        <img
          :src="t.album?.image || 'https://via.placeholder.com/96x96?text=♪'"
          class="h-12 w-12 rounded object-cover"
          :alt="t.name"
        />

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ t.name }}</p>
          <p class="truncate text-xs text-dimmed">
            {{ (t.artists || []).join(', ') }}
          </p>
        </div>

        <span class="text-xs text-dimmed w-12 text-right">{{ ms(t.duration_ms) }}</span>

        <div class="ms-2 hidden items-center gap-1 group-hover:flex">
          <UButton icon="i-lucide-play"   variant="ghost" size="xs" @click="playAt(idx)" />
          <UButton icon="i-lucide-trash-2" color="red" variant="ghost" size="xs" @click="removeTrack(t)" />
        </div>
      </div>

      <div v-if="page.start + page.size < page.total" class="p-2">
        <UButton block variant="soft" icon="i-lucide-chevrons-down" :loading="loading" @click="loadMore">
          Charger plus ({{ Math.min(page.start + page.size, page.total) }} / {{ page.total }})
        </UButton>
      </div>
    </div>
  </div>
</template>
