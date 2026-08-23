<script setup lang="ts">
import { useLecteursWs } from '@/composables/useLecteursWs'
import { useDeviceControlWs } from '@/composables/useDeviceControlWs'
import { useNotifications } from '@/composables/useNotifications'
import { getProviders, type LibraryProvider } from '@/src/api/library'
import { formatTimeAgo } from '@vueuse/core'
import http from '@/src/lib/https'

const { isNotificationsSlideoverOpen } = useDashboard()
const ws = useLecteursWs()

/* ── Lecteurs ───────────────────────────────────────────────────────────── */
const lecteurs    = computed(() => ws.lecteurs.value)
const playing     = computed(() => lecteurs.value.filter(l => l.playing))
const aliveCount  = computed(() => lecteurs.value.filter(l => l.alive).length)

/* Lecteurs à mettre en avant : ceux qui jouent d'abord, sinon les alive */
const featured = computed(() => {
  const p = lecteurs.value.filter(l => l.playing)
  if (p.length) return p
  return lecteurs.value.filter(l => l.alive).slice(0, 4)
})

/* ── Sources (library) ──────────────────────────────────────────────────── */
const providers = ref<LibraryProvider[]>([])
const activeSources = computed(() => providers.value.filter(p => p.active !== false))

/* ── Volume des pièces (devices) ────────────────────────────────────────── */
const devCtrl = useDeviceControlWs()
const rawDevices = ref<any[]>([])
const audioByKey = ref<Record<string, any>>({})
const volOverride = ref<Record<string, number>>({})

const devKey = (d: any) => d.ip || d.allconfig?.interfaces?.address || d.host || ''

const deviceRows = computed(() =>
  rawDevices.value
    .filter(d => Number(d.isalive) === 1)
    .map(d => {
      const key = devKey(d)
      const audio = audioByKey.value[key]
      const vals = audio?.output?.volume ? Object.values(audio.output.volume).map(Number).filter(v => !isNaN(v)) : []
      const level = vals.length ? Math.round(vals.reduce((a: number, b: number) => a + b) / vals.length) : 0
      return { key, name: d.name || d.description || key, online: true, level, hasAudio: !!audio?.output }
    })
)

function deviceVol(key: string, fallback: number) {
  return key in volOverride.value ? volOverride.value[key] : fallback
}
function setDeviceVol(key: string, v: number) {
  volOverride.value = { ...volOverride.value, [key]: v }
  devCtrl.send('Set.output.volume', { targetIp: key, percent: v })
}

const offDevCtrl = devCtrl.on((msg: any) => {
  if (msg?.msg?.method === 'State.audio' && msg.from && msg.msg?.State?.audio) {
    audioByKey.value = { ...audioByKey.value, [String(msg.from)]: msg.msg.State.audio }
  } else if (msg?.method === 'RES.Device' && msg.msg) {
    rawDevices.value = msg.msg
  }
})

function requestDevices() {
  devCtrl.send('Get.Device')
  devCtrl.send('Get.audio')
}
watch(() => devCtrl.status.value, s => { if (s === 'connected') requestDevices() })

/* ── Règles de contrôle ─────────────────────────────────────────────────── */
const rules = ref<any[]>([])
const ruleBusy = ref<string | null>(null)

async function loadRules() {
  try {
    const res = await http.get('/control/rules')
    rules.value = res.data?.rules || []
  } catch { /* noop */ }
}
async function toggleRule(rule: any) {
  if (!rule?.id) return
  ruleBusy.value = rule.id
  try {
    await http.patch(`/control/rules/${rule.id}/toggle`)
    await loadRules()
  } catch { /* noop */ } finally { ruleBusy.value = null }
}

/* ── Notifications récentes ─────────────────────────────────────────────── */
const notif = useNotifications()
const recentNotifs = computed(() => (notif.history.value ?? []).slice(0, 5))
const notifIcon = (type: string) => (notif.EVENT_ICON as any)?.[type] ?? 'i-lucide-bell'
const notifTime = (n: any) => {
  const t = n.createdAt ?? n.timestamp ?? n.date
  return t ? formatTimeAgo(new Date(typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : t)) : ''
}

onMounted(async () => {
  if (devCtrl.status.value === 'connected') requestDevices()
  try { providers.value = await getProviders() } catch { /* noop */ }
  loadRules()
  notif.loadHistory()
})
onUnmounted(() => offDevCtrl())

/* ── Helpers ────────────────────────────────────────────────────────────── */
const toTime = (ms?: number | null) => {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const progress = (l: any) => {
  const pos = l.temp?.position_ms ?? 0
  const dur = l.track?.duration_ms ?? l.temp?.duration_ms ?? 0
  return dur ? Math.min(100, (pos / dur) * 100) : 0
}
const lecteurIcon = (type?: string) =>
  type === 'spotify' ? 'mdi:spotify' : type === 'fileplayer' ? 'mdi:file-music' : type === 'youtube' ? 'mdi:youtube' : type === 'deezer' ? 'i-simple-icons-deezer' : 'i-lucide-music'
const sourceIcon = (s?: string) =>
  s === 'spotify' ? 'mdi:spotify' : s === 'fileplayer' ? 'mdi:file-music' : s === 'youtube' ? 'mdi:youtube' : s === 'deezer' ? 'i-simple-icons-deezer' : 'i-lucide-music'

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bonne après-midi'
  return 'Bonsoir'
})

/* ── Accès rapides ──────────────────────────────────────────────────────── */
const shortcuts = [
  { label: 'Musique',   to: '/musique',  icon: 'i-lucide-music',          color: 'text-emerald-400' },
  { label: 'Lecteurs',  to: '/lecteurs', icon: 'simple-icons:gocd',       color: 'text-sky-400' },
  { label: 'Devices',   to: '/devices',  icon: 'mdi:speaker',             color: 'text-violet-400' },
  { label: 'EQ',        to: '/eq',       icon: 'si:equalizer-fill',       color: 'text-amber-400' },
  { label: 'Snap',      to: '/snap',     icon: 'mdi:cast-audio',          color: 'text-pink-400' },
  { label: 'Bluetooth', to: '/bt',       icon: 'i-lucide-bluetooth',      color: 'text-blue-400' },
  { label: 'Contrôle',  to: '/control',  icon: 'whh:controlpanelalt',     color: 'text-orange-400' },
  { label: 'Settings',  to: '/settings', icon: 'i-lucide-settings',       color: 'text-zinc-400' },
]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Maison" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton color="neutral" variant="ghost" square @click="isNotificationsSlideoverOpen = true">
              <UChip color="error" inset>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 pb-10">

        <!-- Salutation -->
        <div class="flex items-end justify-between gap-3">
          <h1 class="text-2xl sm:text-3xl font-bold">{{ greeting }}</h1>
          <div class="flex items-center gap-1.5 text-[11px]">
            <span
              class="size-2 rounded-full"
              :class="{
                'bg-emerald-400': ws.wsStatus.value === 'connected',
                'bg-amber-400 animate-pulse': ws.wsStatus.value === 'connecting',
                'bg-red-400': ['error','disconnected'].includes(ws.wsStatus.value),
              }"
            />
            <span class="text-dimmed">{{ ws.wsStatus.value }}</span>
          </div>
        </div>

        <!-- ── Bandeau d'état ─────────────────────────────────────────────── -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
            <div class="flex items-center gap-3">
              <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UIcon name="simple-icons:gocd" class="size-5 text-primary" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ lecteurs.length }}</div>
                <div class="text-xs text-dimmed">Lecteurs</div>
              </div>
            </div>
          </UPageCard>

          <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
            <div class="flex items-center gap-3">
              <div class="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-play" class="size-5 text-emerald-400" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ playing.length }}</div>
                <div class="text-xs text-dimmed">En lecture</div>
              </div>
            </div>
          </UPageCard>

          <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
            <div class="flex items-center gap-3">
              <div class="size-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-wifi" class="size-5 text-sky-400" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ aliveCount }}</div>
                <div class="text-xs text-dimmed">En ligne</div>
              </div>
            </div>
          </UPageCard>

          <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
            <div class="flex items-center gap-3">
              <div class="size-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-library" class="size-5 text-violet-400" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ activeSources.length }}</div>
                <div class="text-xs text-dimmed">Sources</div>
              </div>
            </div>
          </UPageCard>
        </div>

        <!-- ── Lecteurs en cours ──────────────────────────────────────────── -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">En cours de lecture</h2>
            <UButton to="/lecteurs" size="xs" variant="link" color="primary" trailing-icon="i-lucide-arrow-right">
              Tous les lecteurs
            </UButton>
          </div>

          <div v-if="!featured.length" class="text-sm text-dimmed py-8 text-center">
            <UIcon name="i-lucide-pause" class="size-8 mx-auto mb-2 opacity-40" />
            Aucun lecteur actif.
          </div>

          <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <UPageCard
              v-for="l in featured"
              :key="l.id"
              variant="subtle"
              class="min-w-0"
              :ui="{ container: 'p-4 gap-y-3' }"
            >
              <div class="flex items-center gap-3">
                <img
                  v-if="l.track?.cover_url"
                  :src="l.track.cover_url"
                  class="h-14 w-14 rounded-lg object-cover shrink-0"
                />
                <div v-else class="h-14 w-14 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                  <UIcon :name="lecteurIcon(l.type)" class="size-6 text-dimmed" />
                </div>
                <div class="min-w-0 flex-1">
                  <MarqueeText class="font-medium" :text="l.track?.title ?? 'Aucune piste'" />
                  <MarqueeText class="text-xs text-dimmed" :text="(l.track?.artists ?? []).join(', ') || l.name" />
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <UIcon :name="lecteurIcon(l.device_type ?? l.type)" class="size-3 text-dimmed" />
                    <span class="text-[11px] text-dimmed truncate">{{ l.name }}</span>
                  </div>
                </div>
              </div>

              <!-- Progression -->
              <div class="flex items-center gap-2">
                <span class="text-[10px] tabular-nums text-dimmed w-8 text-right">{{ toTime(l.temp?.position_ms) }}</span>
                <div class="flex-1 h-1 rounded-full bg-elevated overflow-hidden">
                  <div class="h-full bg-primary rounded-full" :style="{ width: progress(l) + '%' }" />
                </div>
                <span class="text-[10px] tabular-nums text-dimmed w-8">{{ toTime(l.track?.duration_ms ?? l.temp?.duration_ms) }}</span>
              </div>

              <!-- Contrôles -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1">
                  <UButton icon="i-lucide-skip-back" size="xs" color="neutral" variant="ghost" square @click="ws.prev(l.id)" />
                  <UButton :icon="l.playing ? 'i-lucide-pause' : 'i-lucide-play'" size="sm" color="primary" square @click="ws.togglePlayPause(l.id)" />
                  <UButton icon="i-lucide-skip-forward" size="xs" color="neutral" variant="ghost" square @click="ws.next(l.id)" />
                </div>
                <UBadge :color="l.playing ? 'success' : 'neutral'" variant="subtle" size="xs">
                  {{ l.playing ? 'Lecture' : 'En pause' }}
                </UBadge>
              </div>
            </UPageCard>
          </div>
        </section>

        <!-- ── Volume des pièces ──────────────────────────────────────────── -->
        <section v-if="deviceRows.length">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">Volume des pièces</h2>
            <UButton to="/devices" size="xs" variant="link" color="primary" trailing-icon="i-lucide-arrow-right">
              Tous les appareils
            </UButton>
          </div>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <UPageCard
              v-for="d in deviceRows"
              :key="d.key"
              variant="subtle"
              :ui="{ container: 'p-4 gap-y-2' }"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon name="mdi:speaker" class="size-4 text-primary shrink-0" />
                  <span class="font-medium truncate">{{ d.name }}</span>
                </div>
                <span class="text-sm font-mono tabular-nums text-dimmed">{{ deviceVol(d.key, d.level) }}%</span>
              </div>
              <div class="flex items-center gap-2">
                <UIcon
                  :name="deviceVol(d.key, d.level) === 0 ? 'i-lucide-volume-x' : deviceVol(d.key, d.level) < 50 ? 'i-lucide-volume-1' : 'i-lucide-volume-2'"
                  class="size-4 text-dimmed shrink-0"
                />
                <input
                  type="range" min="0" max="100"
                  :value="deviceVol(d.key, d.level)"
                  :disabled="!d.hasAudio"
                  class="flex-1 accent-current h-1.5 range-primary-0 cursor-pointer"
                  @input="setDeviceVol(d.key, +($event.target as HTMLInputElement).value)"
                />
              </div>
            </UPageCard>
          </div>
        </section>

        <!-- ── Règles de contrôle ─────────────────────────────────────────── -->
        <section v-if="rules.length">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">Règles de contrôle</h2>
            <UButton to="/control" size="xs" variant="link" color="primary" trailing-icon="i-lucide-arrow-right">
              Gérer
            </UButton>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="rule in rules"
              :key="rule.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-default bg-elevated/30"
            >
              <UIcon name="whh:controlpanelalt" class="size-4 text-dimmed shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ rule.name || rule.id }}</p>
                <p class="truncate text-[11px] text-dimmed font-mono">{{ rule.from || '—' }} · {{ rule.action || '—' }}</p>
              </div>
              <USwitch
                :model-value="rule.enabled !== false"
                :disabled="ruleBusy === rule.id"
                @update:model-value="toggleRule(rule)"
              />
            </div>
          </div>
        </section>

        <!-- ── Notifications récentes ─────────────────────────────────────── -->
        <section v-if="recentNotifs.length">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">Notifications récentes</h2>
            <UButton size="xs" variant="link" color="primary" trailing-icon="i-lucide-arrow-right" @click="isNotificationsSlideoverOpen = true">
              Tout voir
            </UButton>
          </div>
          <div class="rounded-xl border border-default divide-y divide-default overflow-hidden">
            <div
              v-for="n in recentNotifs"
              :key="n.id"
              class="flex items-center gap-3 px-4 py-2.5"
              :class="{ 'bg-primary/5': !n.read }"
            >
              <UIcon :name="notifIcon(n.type)" class="size-4 shrink-0" :class="n.read ? 'text-dimmed' : 'text-primary'" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm" :class="{ 'font-medium': !n.read }">{{ n.title }}</p>
                <p v-if="n.body" class="truncate text-xs text-dimmed">{{ n.body }}</p>
              </div>
              <span class="text-[11px] text-dimmed shrink-0">{{ notifTime(n) }}</span>
            </div>
          </div>
        </section>

        <!-- ── Accès rapides ──────────────────────────────────────────────── -->
        <section>
          <h2 class="text-lg font-semibold mb-3">Accès rapides</h2>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NuxtLink
              v-for="s in shortcuts"
              :key="s.to"
              :to="s.to"
              class="group rounded-xl border border-default bg-elevated/30 hover:bg-elevated/60 transition-colors p-4 flex flex-col items-center justify-center gap-2 aspect-[4/3]"
            >
              <UIcon :name="s.icon" :class="['size-7 transition-transform group-hover:scale-110', s.color]" />
              <span class="text-sm font-medium">{{ s.label }}</span>
            </NuxtLink>
          </div>
        </section>

      </div>
    </template>
  </UDashboardPanel>
</template>
