<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getVbanStreams, createVbanStream, deleteVbanStream,
  getVbanState, selectVban, clearVbanState,
  type VbanStream, type VbanState, type VbanBlock, type VbanConfig,
} from '@/src/api/vban'

const toast   = useToast()
const pending = ref(false)
const streams = ref<VbanStream[]>([])
const state   = ref<VbanState | null>(null)

/* Menu : Sélection / Streams */
const tab = ref<'select' | 'streams'>('select')

/* ── Helpers ────────────────────────────────────────────────────────────── */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x ?? null))
const range = (n?: number) => Array.from({ length: Math.max(0, Math.floor(n || 0)) }, (_, i) => i)

const RATES   = [44100, 48000, 96000, 192000].map(v => ({ label: `${v} Hz`, value: v }))
const FORMATS = ['paInt16', 'paInt24', 'paFloat32'].map(v => ({ label: v, value: v }))

const activeTarget = computed(() => state.value?.targetIp ?? null)
const isActiveIp   = (ip?: string) => !!ip && ip === activeTarget.value

/* ── Config de travail ──────────────────────────────────────────────────── */
const advanced   = ref(false)
const editingId  = ref<number | string | null>(null)
const saving     = ref(false)
const masterOpen = ref(false)   // UModal Master
const hpOpen     = ref(false)   // UModal Haut-parleurs

const meta     = ref({ name: '', type: 'send', description: '', isStarting: false })
const master   = ref<VbanBlock>(defaultMaster())
const channels = ref<{ key: string; cfg: VbanBlock }[]>([])

function defaultMaster(): VbanBlock {
  return {
    type: 'receiver', ip: '', nameVban: 'Master', channels: 8,
    stream: { format: 2, channels: 2, rate: 48000, output: true, output_device_index: 0, song_local: false, func: '' },
    network: { ip: '', port: 6980 },
  }
}
function defaultChannel(name: string): { key: string; cfg: VbanBlock } {
  return {
    key: name,
    cfg: { type: 'send', ip: '', port: 6980, nameVban: name, stream: { channels: 8, format: 'paInt16', rate: 48000, func: 'None' }, retard: 1 },
  }
}

function resetConfig() {
  editingId.value = null
  meta.value = { name: '', type: 'send', description: '', isStarting: false }
  master.value = defaultMaster()
  channels.value = [defaultChannel('CH1')]
}
function loadStream(s: VbanStream) {
  editingId.value = s.id
  meta.value = { name: s.name, type: s.type || 'send', description: s.description ?? '', isStarting: !!s.isStarting }
  const cfg = (s.config ?? {}) as VbanConfig
  master.value = cfg.Master ? { ...defaultMaster(), ...clone(cfg.Master) } : defaultMaster()
  if (!master.value.network) master.value.network = { ip: '', port: 6980 }
  if (!master.value.stream)  master.value.stream  = defaultMaster().stream
  channels.value = Object.entries(cfg)
    .filter(([k]) => k !== 'Master')
    .map(([key, c]) => ({ key, cfg: { ...defaultChannel(key).cfg, ...clone(c) } }))
  toast.add({ title: `« ${s.name} » chargé`, color: 'neutral' })
}
/* Édition d'UN seul HP à la fois */
const hpIndex   = ref(-1)
const currentHp = computed(() => (hpIndex.value >= 0 ? channels.value[hpIndex.value] ?? null : null))
function editHp(i: number) { hpIndex.value = i; hpOpen.value = true }
function addHp() {
  channels.value.push(defaultChannel(`CH${channels.value.length + 1}`))
  hpIndex.value = channels.value.length - 1
  hpOpen.value = true
}
function removeHp(i: number) {
  channels.value.splice(i, 1)
  if (hpIndex.value === i) { hpOpen.value = false; hpIndex.value = -1 }
}

function assembleConfig(): VbanConfig {
  const cfg: VbanConfig = {}
  const m = clone(master.value)
  m.channel_use_master = range(m.channels ?? 8)
  cfg.Master = m
  for (const ch of channels.value) {
    const key = ch.key.trim()
    if (!key) continue
    const c = clone(ch.cfg)
    c.nameVban = c.nameVban || key
    c.channel_use_master = range(c.stream?.channels ?? 8)
    cfg[key] = c
  }
  return cfg
}

async function save() {
  if (!meta.value.name.trim()) { toast.add({ title: 'Nom requis', color: 'warning' }); return }
  saving.value = true
  try {
    const config = assembleConfig()
    if (editingId.value != null) await deleteVbanStream(editingId.value).catch(() => {})
    await createVbanStream({
      name: meta.value.name.trim(),
      type: meta.value.type,
      description: meta.value.description.trim() || undefined,
      isStarting: meta.value.isStarting,
      config,
    })
    await load()
    toast.add({ title: 'Stream enregistré', color: 'success', icon: 'i-lucide-save' })
  } catch (e: any) {
    toast.add({ title: 'Enregistrement impossible', description: e?.response?.data?.error || e?.response?.data?.message, color: 'error' })
  } finally { saving.value = false }
}

async function onDelete(s: VbanStream) {
  if (!confirm(`Supprimer le stream « ${s.name} » ?`)) return
  try { await deleteVbanStream(s.id); if (editingId.value === s.id) resetConfig(); await load(); toast.add({ title: 'Stream supprimé', color: 'success' }) }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
}

/* ── Sélection ──────────────────────────────────────────────────────────── */
const sel = ref({ targetIp: '', streamId: '', startDelayMs: '' })
const selecting = ref(false)
const streamItems = computed(() => streams.value.map(s => ({ label: s.name, value: String(s.id) })))

async function applySelect() {
  if (!sel.value.targetIp.trim()) { toast.add({ title: 'IP cible requise', color: 'warning' }); return }
  const s = streams.value.find(x => String(x.id) === String(sel.value.streamId))
  const cfg = s?.config ?? assembleConfig()
  selecting.value = true
  try {
    await selectVban({ targetIp: sel.value.targetIp.trim(), cfg, startDelayMs: sel.value.startDelayMs ? Number(sel.value.startDelayMs) : undefined })
    await load()
    toast.add({ title: 'Sélection appliquée', color: 'success', icon: 'i-lucide-cast' })
  } catch (e: any) {
    toast.add({ title: 'Sélection impossible', description: e?.response?.data?.error || e?.response?.data?.message, color: 'error' })
  } finally { selecting.value = false }
}
async function clearSel() {
  if (!confirm('Effacer la sélection et stopper l\'envoi serveur ?')) return
  try { await clearVbanState(); state.value = null; toast.add({ title: 'Sélection effacée', color: 'success' }) }
  catch { toast.add({ title: 'Opération impossible', color: 'error' }) }
}

/* ── Chargement ─────────────────────────────────────────────────────────── */
async function load() {
  pending.value = true
  try {
    const [s, st] = await Promise.all([getVbanStreams().catch(() => []), getVbanState().catch(() => null)])
    streams.value = s
    state.value = st
  } finally { pending.value = false }
}
const hpCount = (s: VbanStream) => Object.keys(s.config ?? {}).filter(k => k !== 'Master').length

onMounted(() => { load(); resetConfig() })
</script>

<template>
  <UDashboardPanel id="vban">
    <template #header>
      <UDashboardNavbar title="VBAN">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton label="Actualiser" color="neutral" icon="i-lucide-refresh-cw" :loading="pending" @click="load" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-5 pb-10">

        <!-- ── Menu : Sélection / Streams ───────────────────────────────────── -->
        <div class="grid gap-2 lg:grid-cols-2">
          <UPageCard variant="subtle" class="cursor-pointer transition-shadow" :class="tab === 'select' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-default'" :ui="{ container: 'p-4 gap-y-2' }" @click="tab = 'select'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0"><UIcon name="i-lucide-cast" class="size-7 shrink-0 text-primary" /><p class="font-semibold truncate">Sélection</p></div>
              <UBadge :color="state ? 'success' : 'neutral'" variant="subtle" :icon="state ? 'i-lucide-check-circle' : 'i-lucide-circle-dashed'">{{ state ? 'En diffusion' : 'Arrêté' }}</UBadge>
            </div>
            <p class="text-xs text-dimmed truncate">{{ state ? state.targetIp : 'Aucune cible active' }}</p>
          </UPageCard>

          <UPageCard variant="subtle" class="cursor-pointer transition-shadow" :class="tab === 'streams' ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-default'" :ui="{ container: 'p-4 gap-y-2' }" @click="tab = 'streams'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0"><UIcon name="i-lucide-network" class="size-7 shrink-0 text-primary" /><p class="font-semibold truncate">Streams</p></div>
              <UBadge color="neutral" variant="subtle">{{ streams.length }}</UBadge>
            </div>
            <p class="text-xs text-dimmed truncate">Streams VBAN enregistrés</p>
          </UPageCard>
        </div>

        <!-- ── Sélection ────────────────────────────────────────────────────── -->
        <UPageCard v-show="tab === 'select'" variant="subtle" :ui="{ container: 'p-0 gap-y-0' }" class="overflow-hidden">
          <div class="flex items-center gap-4 px-5 py-4" :class="state ? 'bg-gradient-to-r from-primary/15 to-transparent' : 'bg-elevated/40'">
            <div class="size-12 rounded-xl flex items-center justify-center shrink-0" :class="state ? 'bg-primary/20' : 'bg-elevated'">
              <UIcon name="i-lucide-cast" class="size-6" :class="state ? 'text-primary' : 'text-dimmed'" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] uppercase tracking-widest text-dimmed">Sélection active</p>
              <template v-if="state">
                <p class="text-lg font-bold leading-tight truncate">{{ state.targetIp || '—' }}</p>
                <p v-if="state.startDelayMs != null" class="text-xs text-dimmed">Délai : {{ state.startDelayMs }} ms</p>
              </template>
              <p v-else class="text-base font-medium text-dimmed">Aucune cible active</p>
            </div>
            <UButton v-if="state" icon="i-lucide-power-off" color="error" variant="soft" size="sm" @click="clearSel">Arrêter</UButton>
          </div>
          <div class="px-5 py-4 border-t border-default space-y-3">
            <div class="grid gap-3 sm:grid-cols-3">
              <UFormField label="IP cible"><UInput v-model="sel.targetIp" placeholder="192.168.1.50" icon="i-lucide-globe" class="w-full" /></UFormField>
              <UFormField label="Stream (config)"><USelect v-model="sel.streamId" :items="streamItems" placeholder="Config actuelle" icon="i-lucide-list" class="w-full" /></UFormField>
              <UFormField label="Délai (ms)"><UInput v-model="sel.startDelayMs" type="number" placeholder="0" icon="i-lucide-timer" class="w-full" /></UFormField>
            </div>
            <div class="flex justify-end">
              <UButton icon="i-lucide-cast" color="primary" :loading="selecting" @click="applySelect">Sélectionner & diffuser</UButton>
            </div>
          </div>
        </UPageCard>

        <!-- ── Streams ──────────────────────────────────────────────────────── -->
        <div v-show="tab === 'streams'" class="space-y-3">

          <!-- Config courante : identité + 2 cards (Master / HP) ouvrant chacune son modal -->
          <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium">{{ editingId != null ? 'Configuration en cours' : 'Nouvelle configuration' }}</p>
              <UButton label="Nouvelle" size="xs" color="neutral" variant="soft" icon="i-lucide-file-plus" @click="resetConfig" />
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
              <UFormField label="Nom"><UInput v-model="meta.name" placeholder="Salon" class="w-full" /></UFormField>
              <UFormField label="Type"><USelect v-model="meta.type" :items="[{ label: 'send', value: 'send' }, { label: 'receiver', value: 'receiver' }]" class="w-full" /></UFormField>
              <UFormField label="Description"><UInput v-model="meta.description" placeholder="Optionnel" class="w-full" /></UFormField>
            </div>

            <!-- Master : 1 clic = son modal -->
            <button class="w-full flex items-center gap-3 p-3 rounded-lg border border-default text-left hover:bg-elevated/40 transition-colors" @click="masterOpen = true">
              <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><UIcon name="i-lucide-speaker" class="size-4 text-primary" /></div>
              <div class="min-w-0 flex-1">
                <p class="font-medium leading-tight">Master — récepteur</p>
                <p class="text-xs text-dimmed truncate">{{ master.ip || 'à configurer' }} · {{ master.channels }} canaux</p>
              </div>
              <UIcon name="i-lucide-pencil" class="size-4 text-dimmed" />
            </button>

            <!-- Haut-parleurs : 1 clic sur un HP = ce HP / bouton dédié pour ajouter -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium flex items-center gap-2"><UIcon name="i-lucide-radio-tower" class="size-4 text-primary" />Haut-parleurs<UBadge color="neutral" variant="subtle" size="xs">{{ channels.length }}</UBadge></p>
                <UButton icon="i-lucide-plus" size="xs" variant="soft" color="neutral" @click="addHp">Ajouter un HP</UButton>
              </div>
              <p v-if="!channels.length" class="text-sm text-dimmed italic">Aucun haut-parleur.</p>
              <button
                v-for="(ch, i) in channels" :key="i"
                class="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors"
                :class="isActiveIp(ch.cfg.ip) ? 'border-primary/60 hover:bg-primary/5' : 'border-default hover:bg-elevated/40'"
                @click="editHp(i)"
              >
                <UIcon name="i-lucide-speaker" class="size-4 text-dimmed shrink-0" />
                <span class="font-mono text-sm font-medium shrink-0">{{ ch.key || '—' }}</span>
                <span class="text-xs text-dimmed truncate flex-1">{{ ch.cfg.ip || 'à configurer' }}<span v-if="ch.cfg.port">:{{ ch.cfg.port }}</span></span>
                <UBadge v-if="isActiveIp(ch.cfg.ip)" color="success" variant="subtle" size="xs">Actif</UBadge>
                <UIcon name="i-lucide-pencil" class="size-4 text-dimmed shrink-0" />
                <UIcon name="i-lucide-trash-2" class="size-4 text-error shrink-0" role="button" tabindex="0" @click.stop="removeHp(i)" />
              </button>
            </div>

            <div class="flex items-center justify-between border-t border-default pt-3">
              <USwitch v-model="meta.isStarting" label="Démarrage auto" />
              <UButton :label="editingId != null ? 'Mettre à jour' : 'Enregistrer'" icon="i-lucide-save" color="primary" :loading="saving" :disabled="!meta.name.trim()" @click="save" />
            </div>
          </UPageCard>

          <!-- Liste des configs enregistrées -->
          <UPageCard title="Enregistrées" description="Cliquez pour charger." variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
            <div v-if="pending && !streams.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><USkeleton v-for="i in 3" :key="i" class="h-16 rounded-xl" /></div>
            <p v-else-if="!streams.length" class="text-sm text-dimmed italic">Aucune configuration enregistrée.</p>
            <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div v-for="s in streams" :key="s.id" class="group rounded-xl border p-3 cursor-pointer transition-colors" :class="editingId === s.id ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated/40'" @click="loadStream(s)">
                <div class="flex items-center gap-2.5">
                  <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><UIcon name="i-lucide-network" class="size-4 text-primary" /></div>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate leading-tight">{{ s.name }}</p>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <UBadge color="neutral" variant="subtle" size="xs">{{ s.type }}</UBadge>
                      <UBadge v-if="s.isStarting" color="success" variant="subtle" size="xs" icon="i-lucide-zap">auto</UBadge>
                      <span class="text-xs text-dimmed">{{ hpCount(s) }} HP</span>
                    </div>
                  </div>
                  <UButton icon="i-lucide-trash-2" size="2xs" color="error" variant="ghost" class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click.stop="onDelete(s)" />
                </div>
              </div>
            </div>
          </UPageCard>
        </div>

      </div>
    </template>
  </UDashboardPanel>

  <!-- ── UModal Master ───────────────────────────────────────────────────── -->
  <UModal v-model:open="masterOpen" title="Master — récepteur" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-xs text-dimmed">Le récepteur qui sort le son (HP source).</p>
          <USwitch v-model="advanced" label="Options avancées" />
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Nom VBAN"><UInput v-model="master.nameVban" class="w-full" /></UFormField>
          <UFormField label="IP"><UInput v-model="master.ip" placeholder="192.168.1.18" class="w-full" /></UFormField>
          <UFormField label="Canaux"><UInput v-model.number="master.channels" type="number" min="1" class="w-full" /></UFormField>
          <UFormField label="Réseau — IP"><UInput v-model="master.network!.ip" placeholder="192.168.4.207" class="w-full" /></UFormField>
          <UFormField label="Réseau — Port"><UInput v-model.number="master.network!.port" type="number" class="w-full" /></UFormField>
        </div>
        <template v-if="advanced">
          <USeparator label="Audio" />
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="Fréquence"><USelect v-model="master.stream.rate" :items="RATES" class="w-full" /></UFormField>
            <UFormField label="Format" description="2 ou paInt16…">
              <UInput :model-value="String(master.stream.format ?? '')" placeholder="2" class="w-full" @update:model-value="(v: string) => master.stream.format = /^\d+$/.test(v) ? Number(v) : v" />
            </UFormField>
            <UFormField label="Canaux flux"><UInput v-model.number="master.stream.channels" type="number" class="w-full" /></UFormField>
            <UFormField label="Device sortie (index)"><UInput v-model.number="master.stream.output_device_index" type="number" class="w-full" /></UFormField>
            <UFormField label="Func"><UInput v-model="master.stream.func" class="w-full" /></UFormField>
          </div>
          <div class="flex items-center gap-6">
            <USwitch v-model="master.stream.output" label="Sortie (output)" />
            <USwitch v-model="master.stream.song_local" label="Lecture locale" />
          </div>
        </template>
        <div class="flex justify-end border-t border-default pt-3">
          <UButton label="OK" color="primary" icon="i-lucide-check" @click="masterOpen = false" />
        </div>
      </div>
    </template>
  </UModal>

  <!-- ── UModal Haut-parleur (UN seul) ───────────────────────────────────── -->
  <UModal v-model:open="hpOpen" :title="currentHp ? `Haut-parleur — ${currentHp.key || ''}` : 'Haut-parleur'" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div v-if="currentHp" class="p-5 space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-xs text-dimmed">Cible d'envoi (HP) du flux.</p>
          <USwitch v-model="advanced" label="Options avancées" />
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Clé"><UInput v-model="currentHp.key" placeholder="CH1" class="w-full" /></UFormField>
          <UFormField label="IP"><UInput v-model="currentHp.cfg.ip" placeholder="192.168.4.181" class="w-full" /></UFormField>
          <UFormField label="Port"><UInput v-model.number="currentHp.cfg.port" type="number" class="w-full" /></UFormField>
          <template v-if="advanced">
            <UFormField label="Nom VBAN"><UInput v-model="currentHp.cfg.nameVban" class="w-full" /></UFormField>
            <UFormField label="Canaux"><UInput v-model.number="currentHp.cfg.stream.channels" type="number" class="w-full" /></UFormField>
            <UFormField label="Format"><USelect :model-value="String(currentHp.cfg.stream.format ?? '')" :items="FORMATS" class="w-full" @update:model-value="(v: string) => currentHp!.cfg.stream.format = v" /></UFormField>
            <UFormField label="Fréquence"><USelect v-model="currentHp.cfg.stream.rate" :items="RATES" class="w-full" /></UFormField>
            <UFormField label="Retard"><UInput v-model.number="currentHp.cfg.retard" type="number" class="w-full" /></UFormField>
            <UFormField label="Func"><UInput v-model="currentHp.cfg.stream.func" class="w-full" /></UFormField>
          </template>
        </div>
        <div class="flex items-center justify-between border-t border-default pt-3">
          <UButton label="Supprimer" color="error" variant="soft" icon="i-lucide-trash-2" @click="removeHp(hpIndex)" />
          <UButton label="OK" color="primary" icon="i-lucide-check" @click="hpOpen = false" />
        </div>
      </div>
    </template>
  </UModal>
</template>
