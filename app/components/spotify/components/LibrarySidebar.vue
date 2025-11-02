<script setup lang="ts">
import http from '@/src/lib/https'

/* ── Props : tenir compte du header sticky et du lecteur ── */
const props = withDefaults(defineProps<{
  headerHeight?: number
  playerHeight?: number
  playerHeighti?: number
}>(), {
  headerHeight: 92,
  playerHeight: 110,
  playerHeighti: 104
})

/* ── Types ── */
type Image = { url: string; width: number | null; height: number | null }
type Playlist = {
  id: string; name: string; uri: string; href: string;
  images?: Image[];
  tracks?: { href: string; total: number };
  snapshot_id?: string;
  owner?: { display_name?: string };
}
type Paging<T> = { href: string; items: T[]; limit: number; next: string|null; offset: number; previous: string|null; total: number }

/** Snapshot JSON côté API (GET /spotify/me/tracks/sync-json) */
type SnapshotPayload = {
  generated_at: string
  total: number
  // on n’utilise pas items[] ici (c’est le parent qui gère la vue détaillée)
}

/* ── Onglets ── */
type Section = 'playlists' | 'albums' | 'artists'
const sections: { key: Section; label: string; icon: string }[] = [
  { key: 'playlists', label: 'Playlists', icon: 'i-lucide-list-music' },
  { key: 'albums',    label: 'Albums',    icon: 'i-lucide-album' },
  { key: 'artists',   label: 'Artistes',  icon: 'i-lucide-user-music' }
]

/* ── Emits ── */
const emit = defineEmits<{
  (e: 'select-playlist', id: string): void
  (e: 'create-playlist'): void
  (e: 'refresh'): void
  (e: 'open-liked'): void
}>()

/* ── State ── */
const active = ref<Section>('playlists')
const loading = ref(false)
const errorMsg = ref<string | null>(null)

/* Playlists */
const items = ref<Playlist[]>([])
const paging = reactive({ limit: 50, offset: 0, total: 0 })

/* Méta “Titres likés” (snapshot) */
const likedTotal = ref<number | null>(null)
const likedGeneratedAt = ref<string | null>(null)
const likedBusy = ref(false)

/* ── Fetch Playlists ── */
async function fetchPlaylists(limit = paging.limit, offset = 0) {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await http.get<Paging<Playlist>>('/spotify/playlists/me', { params: { limit, offset } })
    const data = (res as any).data ?? res
    items.value = data.items ?? []
    paging.limit = data.limit
    paging.offset = data.offset
    paging.total = data.total
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Impossible de charger vos playlists'
    console.error('[LibrarySidebar] fetchPlaylists error:', e)
  } finally {
    loading.value = false
  }
}
const actionBusy = ref<string | null>(null)

async function playPlaylist(p: Playlist) {
  try {
    actionBusy.value = p.id
    // Démarre la lecture du contexte playlist depuis le début
    await http.put('/spotify/devices/play', {
      context_uri: p.uri,
      offset: { position: 0 }
    })
  } catch (e: any) {
    console.error('[play playlist]', e)
    errorMsg.value = e?.response?.data?.error || e?.message || 'Lecture impossible'
  } finally {
    actionBusy.value = null
  }
}

async function renamePlaylist(p: Playlist) {
  const name = window.prompt('Nouveau nom de la playlist :', p.name)
  if (!name || name.trim() === p.name) return
  try {
    actionBusy.value = p.id
    // PUT /playlists/:playlist_id  body: { name }
    await http.put(`/spotify/playlists/${p.id}`, { name: name.trim() })
    // MAJ locale optimiste
    const target = items.value.find(i => i.id === p.id)
    if (target) target.name = name.trim()
  } catch (e: any) {
    console.error('[rename playlist]', e)
    errorMsg.value = e?.response?.data?.error || e?.message || 'Renommage impossible'
  } finally {
    actionBusy.value = null
  }
}

async function deletePlaylist(p: Playlist) {
  // Sur Spotify, “supprimer” = se désabonner / retirer de ta bibliothèque :
  // DELETE /playlists/:playlist_id/follow
  if (!confirm(`Retirer « ${p.name} » de votre bibliothèque ?`)) return
  try {
    actionBusy.value = p.id
    await http.delete(`/spotify/playlists/${p.id}/follow`)
    // Retirer de la liste locale
    items.value = items.value.filter(i => i.id !== p.id)
    paging.total = Math.max(0, paging.total - 1)
  } catch (e: any) {
    console.error('[delete playlist]', e)
    errorMsg.value = e?.response?.data?.error || e?.message || 'Suppression impossible'
  } finally {
    actionBusy.value = null
  }
}
/* ── Fetch méta snapshot “Titres likés” ── */
async function fetchLikedMeta() {
  likedBusy.value = true
  try {
    const res = await http.get<SnapshotPayload>('/spotify/me/tracks/sync-json')
    const data = (res as any).data ?? res
    likedTotal.value = data?.total ?? 0
    likedGeneratedAt.value = data?.generated_at ?? null
  } catch (e) {
    // si pas de snapshot encore, on garde null
    likedTotal.value = likedTotal.value ?? null
    likedGeneratedAt.value = likedGeneratedAt.value ?? null
  } finally {
    likedBusy.value = false
  }
}

/* ── Régénérer le snapshot côté API ── */
async function regenerateSnapshot() {
  if (likedBusy.value) return
  likedBusy.value = true
  try {
    await http.post('/spotify/me/tracks/sync-json', {})
    await fetchLikedMeta()
  } catch (e: any) {
    console.error('[LibrarySidebar] regenerateSnapshot error:', e)
  } finally {
    likedBusy.value = false
  }
}

/* Refresh selon l’onglet */
async function onRefresh() {
  emit('refresh')
  if (active.value === 'playlists') await fetchPlaylists(paging.limit, paging.offset)
  // on recharge aussi les méta des likés pour garder le badge à jour
  await fetchLikedMeta()
}

/* Recherche playlists locale */
const q = ref('')
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const filtered = computed(() => {
  if (active.value !== 'playlists') return []
  if (!q.value) return items.value
  const n = normalize(q.value)
  return items.value.filter(p => normalize(p.name).includes(n))
})

/* Actions UI */
function selectPlaylist(id: string) { emit('select-playlist', id) }
function onCreatePlaylist() { emit('create-playlist') }

/* Auto-fetch au mount */
onMounted(async () => {
  await fetchPlaylists()
  await fetchLikedMeta()
})

/* Scroll calculé pour ne pas se faire masquer par le player */
const scrollStyle = computed(() => ({
  maxHeight: `calc(100vh - ${110}px - ${props.playerHeight}px)`
  /* paddingBottom: `${props.playerHeight}px` */
}))
</script>

<template>
  <aside class="w-72 shrink-0 border-r border-default bg-elevated/30">
    <!-- HEADER sticky -->
    <div class="sticky top-0 z-10 bg-elevated/60 backdrop-blur border-b border-default">
      <div class="px-3 pt-3 flex items-center gap-2">
        <UInput
          v-model="q"
          placeholder="Rechercher…"
          icon="i-lucide-search"
          class="flex-1"
          :disabled="active!=='playlists'"
        />
        <UTooltip text="Nouvelle playlist">
          <UButton icon="i-lucide-plus" color="neutral" variant="ghost" square @click="onCreatePlaylist" />
        </UTooltip>
        <UTooltip text="Rafraîchir">
          <UButton icon="i-lucide-refresh-ccw" color="neutral" variant="ghost" square :loading="loading" @click="onRefresh" />
        </UTooltip>
      </div>

      <!-- Onglets -->
      <div class="px-2 pt-2 pb-2">
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="s in sections"
            :key="s.key"
            class="flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs hover:bg-elevated/50"
            :class="active === s.key ? 'bg-elevated/70 text-highlighted' : 'text-dimmed'"
            @click="active = s.key"
          >
            <UIcon :name="s.icon" class="size-4" />
            <span class="truncate">{{ s.label }}</span>
          </button>
        </div>
      </div>

      <!-- Stats / état -->
      <div class="px-3 pb-2 flex items-center justify-between">
        <p class="text-xs text-dimmed">
          <template v-if="active==='playlists'">Playlists <span v-if="paging.total">({{ paging.total }})</span></template>
          <template v-else-if="active==='albums'">Albums</template>
          <template v-else-if="active==='artists'">Artistes</template>
        </p>
        <div class="flex items-center gap-2">
          <UIcon v-if="loading" name="i-lucide-loader-circle" class="animate-spin text-dimmed" />
        </div>
      </div>
    </div>

    <!-- CORPS scrollable -->
    <div class="p-2 overflow-y-auto" :style="scrollStyle">
      <UAlert v-if="errorMsg" color="red" class="mb-2" :title="errorMsg" />

      <!-- Onglet: Playlists -->
      <template v-if="active === 'playlists'">
        <!-- Entrée spéciale “Titres likés” (ouvre la vue détaillée via le parent) -->
        <div class="group relative mb-1.5">
          <button
            class="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left"
            @click="$emit('open-liked')"
          >
            <div class="h-8 w-8 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
              <UIcon name="i-lucide-heart" class="text-white size-4" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm">Titres likés
                <UBadge v-if="likedTotal !== null" size="xs" variant="subtle" class="ml-1">{{ likedTotal }}</UBadge>
              </p>
              <p class="truncate text-[11px] text-dimmed">
                {{ likedGeneratedAt ? ('Maj ' + new Date(likedGeneratedAt).toLocaleString()) : 'Snapshot non généré' }}
              </p>
            </div>

            <UTooltip text="Régénérer le snapshot">
              <UButton
                icon="i-lucide-rotate-ccw"
                color="neutral" variant="ghost" square
                class="ms-auto opacity-0 group-hover:opacity-100 transition-opacity"
                :loading="likedBusy"
                @click.stop="regenerateSnapshot"
              />
            </UTooltip>
          </button>
        </div>

        <div v-if="!loading && filtered.length === 0" class="px-2 py-1.5 text-sm text-dimmed">
          Aucune playlist.
        </div>

        <div v-for="p in filtered" :key="p.id" class="group relative">
          <button
            class="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-elevated/40 text-left"
            @click="selectPlaylist(p.id)"
          >
            <img
              :src="p.images?.[0]?.url || 'https://via.placeholder.com/64x64?text=PL'"
              class="h-8 w-8 rounded object-cover"
              alt=""
            />
            <div class="min-w-0">
              <p class="truncate text-sm">{{ p.name }}</p>
              <p class="truncate text-xs text-dimmed">
                {{ p.tracks?.total ?? 0 }} titres
                <span v-if="p.owner?.display_name"> · {{ p.owner.display_name }}</span>
              </p>
            </div>

            <UDropdownMenu
              :items="[
                [
                  { key: 'open',   label: 'Ouvrir',    icon: 'i-lucide-arrow-right' },
                  { key: 'play',   label: 'Lire',      icon: 'i-lucide-play',        disabled: actionBusy === p.id }
                ],
                [
                  { key: 'rename', label: 'Renommer',  icon: 'i-lucide-edit-3',      disabled: actionBusy === p.id }
                ],
                [
                  { key: 'delete', label: 'Supprimer', icon: 'i-lucide-trash-2',     color: 'red', disabled: actionBusy === p.id }
                ]
              ]"
              :content="{ align: 'end', sideOffset: 4 }"
            >
              <UButton
                icon="i-lucide-more-horizontal"
                color="neutral" variant="ghost" square
                class="ms-auto opacity-0 group-hover:opacity-100 transition-opacity"
                @click.stop
              />
              <template #item="{ item, close }">
                <button
                  class="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-elevated/40 disabled:opacity-60"
                  :disabled="item.disabled"
                  @click.stop="
                    () => {
                      if (item.key === 'open')   emit('select-playlist', p.id)
                      else if (item.key === 'play')   playPlaylist(p)
                      else if (item.key === 'rename') renamePlaylist(p)
                      else if (item.key === 'delete') deletePlaylist(p)
                      close()
                    }
                  "
                >
                  <UIcon :name="item.icon" class="size-4" />
                  <span :class="item.color === 'red' ? 'text-red-500' : ''">{{ item.label }}</span>
                </button>
              </template>
            </UDropdownMenu>
          </button>
        </div>
      </template>

      <!-- Onglet: Albums (placeholder) -->
      <template v-else-if="active === 'albums'">
        <div class="px-2 py-1.5 text-sm text-dimmed">Albums (à venir)</div>
      </template>

      <!-- Onglet: Artistes (placeholder) -->
      <template v-else-if="active === 'artists'">
        <div class="px-2 py-1.5 text-sm text-dimmed">Artistes (à venir)</div>
      </template>
    </div>
  </aside>
</template>
