<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getSnapServers, createSnapServer, setSnapServerFifos, setSnapServerEnabled,
  applySnapServer, deleteSnapServer, serverFifoIds,
  syncSnap, startSnapService, stopSnapService, getSnapServiceStatus,
  type SnapServer
} from '@/src/api/snap'
import { getFifos, type Fifo } from '@/src/api/fifo'

const toast    = useToast()
const pending  = ref(false)
const servers  = ref<SnapServer[]>([])
const fifos    = ref<Fifo[]>([])
const busy     = ref<string | null>(null)

/* ── Service snapserver ─────────────────────────────────────────────────── */
const service = ref<string>('')
const running = computed(() => service.value === 'running' || service.value === 'started')

async function refreshStatus() {
  try { service.value = (await getSnapServiceStatus())?.status ?? '' } catch { service.value = '' }
}

async function load() {
  pending.value = true
  try {
    const [srv, fi] = await Promise.all([
      getSnapServers().catch(() => [] as SnapServer[]),
      getFifos().catch(() => [] as Fifo[]),
    ])
    servers.value = srv
    fifos.value   = fi
  } finally { pending.value = false }
  refreshStatus()
}

const fifoById = computed(() => {
  const m = new Map<number, Fifo>()
  for (const f of fifos.value) m.set(Number(f.id), f)
  return m
})
const fifoLabel = (id: number) => {
  const f = fifoById.value.get(id)
  return f ? (f.label || f.path) : `#${id}`
}

/* ── Actions service / conf ─────────────────────────────────────────────── */
async function onSync() {
  busy.value = 'sync'
  try {
    const res = await syncSnap()
    toast.add({ title: 'snapserver.conf régénéré', description: res?.path, color: 'success', icon: 'i-lucide-file-cog' })
  } catch (e: any) {
    toast.add({ title: 'Sync impossible', description: e?.response?.data?.error, color: 'error' })
  } finally { busy.value = null }
}

async function onStartStop() {
  busy.value = 'service'
  try {
    const res = running.value ? await stopSnapService() : await startSnapService()
    service.value = res?.status ?? ''
    toast.add({ title: `snapserver ${service.value}`, color: 'success' })
  } catch { toast.add({ title: 'Opération impossible', color: 'error' }) }
  finally { busy.value = null }
}

/* ── Actions serveur ────────────────────────────────────────────────────── */
async function onToggle(s: SnapServer, value: boolean) {
  busy.value = `en:${s.ip}`
  try { await setSnapServerEnabled(s.ip, value); s.enabled = value }
  catch (e: any) { toast.add({ title: 'Modification impossible', description: e?.response?.data?.error, color: 'error' }) }
  finally { busy.value = null }
}

const confOpen = ref(false)
const confText = ref('')
const confIp   = ref('')

async function onApply(s: SnapServer) {
  busy.value = `ap:${s.ip}`
  try {
    const res = await applySnapServer(s.ip)
    if (res?.written) {
      toast.add({ title: 'Conf écrite', description: res.path || s.ip, color: 'success', icon: 'i-lucide-check' })
    } else {
      // serveur distant → la conf est renvoyée, à copier sur la machine cible
      confIp.value   = s.ip
      confText.value = res?.conf ?? ''
      confOpen.value = true
    }
  } catch (e: any) {
    toast.add({ title: 'Génération impossible', description: e?.response?.data?.error, color: 'error' })
  } finally { busy.value = null }
}

async function copyConf() {
  try { await navigator.clipboard.writeText(confText.value); toast.add({ title: 'Conf copiée', color: 'neutral' }) }
  catch { /* presse-papier indisponible */ }
}

async function onDelete(s: SnapServer) {
  if (!confirm(`Supprimer le serveur « ${s.name || s.ip} » ?`)) return
  busy.value = `del:${s.ip}`
  try { await deleteSnapServer(s.ip); await load(); toast.add({ title: 'Serveur supprimé', color: 'success' }) }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
  finally { busy.value = null }
}

/* ── FIFO rattachés ─────────────────────────────────────────────────────── */
const fifoOpen  = ref(false)
const fifoIp    = ref('')
const fifoDraft = ref<number[]>([])
const fifoSaving = ref(false)

function openFifos(s: SnapServer) {
  fifoIp.value    = s.ip
  fifoDraft.value = serverFifoIds(s)
  fifoOpen.value  = true
}
function toggleFifo(id: number) {
  const i = fifoDraft.value.indexOf(id)
  if (i >= 0) fifoDraft.value.splice(i, 1)
  else fifoDraft.value.push(id)
}
async function saveFifos() {
  fifoSaving.value = true
  try {
    await setSnapServerFifos(fifoIp.value, [...fifoDraft.value])
    await load()
    fifoOpen.value = false
    toast.add({ title: 'FIFO rattachés', description: 'Pensez à « Régénérer la conf ».', color: 'success', icon: 'i-lucide-link' })
  } catch (e: any) {
    toast.add({ title: 'Enregistrement impossible', description: e?.response?.data?.error || 'Id de FIFO inconnu', color: 'error' })
  } finally { fifoSaving.value = false }
}

/* ── Ajout d'un serveur ─────────────────────────────────────────────────── */
const addOpen = ref(false)
const adding  = ref(false)
const form    = ref({ ip: '', port: 1705, name: '', isLocal: false, enabled: true })

function openAdd() {
  form.value = { ip: '', port: 1705, name: '', isLocal: false, enabled: true }
  addOpen.value = true
}
async function onCreate() {
  const ip = form.value.ip.trim()
  if (!ip) { toast.add({ title: 'IP requise', color: 'warning' }); return }
  adding.value = true
  try {
    await createSnapServer({
      ip,
      port:    form.value.port || undefined,
      name:    form.value.name.trim() || undefined,
      isLocal: form.value.isLocal,
      enabled: form.value.enabled,
    })
    addOpen.value = false
    await load()
    toast.add({ title: 'Serveur ajouté', description: ip, color: 'success', icon: 'i-lucide-server' })
  } catch (e: any) {
    toast.add({ title: 'Ajout impossible', description: e?.response?.data?.error || 'Config ou FIFO invalide', color: 'error' })
  } finally { adding.value = false }
}

onMounted(load)
</script>

<template>
  <div class="p-4 space-y-4">
    <UPageCard
      title="Serveurs Snapcast"
      description="Chaque serveur expose ses FIFO. Enchaînement : FIFO → rattacher → régénérer la conf → démarrer."
      variant="naked"
      orientation="horizontal"
    >
      <div class="flex flex-wrap gap-2 lg:ms-auto">
        <UButton label="Régénérer la conf" color="neutral" variant="soft" icon="i-lucide-file-cog" :loading="busy === 'sync'" @click="onSync" />
        <UButton
          :label="running ? 'Arrêter' : 'Démarrer'"
          :color="running ? 'error' : 'primary'"
          :icon="running ? 'i-lucide-square' : 'i-lucide-play'"
          variant="soft" :loading="busy === 'service'"
          @click="onStartStop"
        />
        <UButton label="Actualiser" color="neutral" icon="i-lucide-refresh-cw" :loading="pending" @click="load" />
        <UButton label="Nouveau serveur" color="primary" icon="i-lucide-plus" @click="openAdd" />
      </div>
    </UPageCard>

    <!-- État du service -->
    <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-0' }">
      <div class="flex items-center gap-3">
        <span class="size-2.5 rounded-full shrink-0" :class="running ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'" />
        <p class="text-sm">
          snapserver :
          <span class="font-medium">{{ service || 'inconnu' }}</span>
        </p>
        <UBadge color="neutral" variant="subtle" size="xs" class="ms-auto">{{ servers.length }} serveur(s)</UBadge>
      </div>
    </UPageCard>

    <!-- Liste -->
    <div v-if="pending && !servers.length" class="grid gap-2">
      <USkeleton v-for="i in 2" :key="i" class="h-24 rounded-lg" />
    </div>
    <UPageCard v-else-if="!servers.length" variant="subtle" :ui="{ container: 'p-6' }">
      <p class="text-sm text-dimmed italic text-center">Aucun serveur déclaré.</p>
    </UPageCard>

    <div v-else class="grid gap-2">
      <UPageCard v-for="s in servers" :key="s.ip" variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-server" class="size-6 shrink-0" :class="s.enabled ? 'text-primary' : 'text-dimmed'" />

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0">
              <p class="font-semibold truncate">{{ s.name || s.ip }}</p>
              <UBadge v-if="s.isLocal" color="primary" variant="subtle" size="xs" icon="i-lucide-house">local</UBadge>
            </div>
            <p class="text-xs text-dimmed font-mono truncate">{{ s.ip }}<span v-if="s.port">:{{ s.port }}</span></p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-dimmed hidden sm:inline">Activé</span>
            <USwitch :model-value="s.enabled" :disabled="busy === `en:${s.ip}`" @update:model-value="(v) => onToggle(s, v)" />
          </div>

          <UDropdownMenu
            :items="[[
              { label: 'Rattacher des FIFO', icon: 'i-lucide-link',     onSelect: () => openFifos(s) },
              { label: 'Générer la conf',    icon: 'i-lucide-file-cog', onSelect: () => onApply(s) },
              { label: 'Supprimer',          icon: 'i-lucide-trash-2',  onSelect: () => onDelete(s) }
            ]]"
          >
            <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" square :loading="busy === `ap:${s.ip}` || busy === `del:${s.ip}`" />
          </UDropdownMenu>
        </div>

        <!-- FIFO rattachés -->
        <div class="flex items-center gap-2 flex-wrap border-t border-default pt-3">
          <span class="text-xs text-dimmed">FIFO</span>
          <UBadge v-for="id in serverFifoIds(s)" :key="id" color="neutral" variant="subtle" size="xs">
            {{ fifoLabel(id) }}
          </UBadge>
          <span v-if="!serverFifoIds(s).length" class="text-xs text-dimmed italic">aucun</span>
          <UButton icon="i-lucide-link" size="xs" variant="ghost" color="neutral" class="ms-auto" @click="openFifos(s)">Modifier</UButton>
        </div>
      </UPageCard>
    </div>

    <!-- Modal : rattacher des FIFO -->
    <UModal v-model:open="fifoOpen" :title="`FIFO — ${fifoIp}`">
      <template #content>
        <div class="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
          <p class="text-xs text-dimmed">Cochez les tubes exposés par ce serveur.</p>

          <p v-if="!fifos.length" class="text-sm text-dimmed italic py-3 text-center">
            Aucun FIFO déclaré — <NuxtLink to="/settings/fifo" class="text-primary underline">en créer un</NuxtLink>
          </p>
          <div v-else class="space-y-1 max-h-[55vh] overflow-y-auto">
            <button
              v-for="f in fifos" :key="f.id"
              class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors border"
              :class="fifoDraft.includes(Number(f.id)) ? 'border-primary bg-primary/10' : 'border-default hover:bg-elevated/50'"
              @click="toggleFifo(Number(f.id))"
            >
              <UIcon
                :name="fifoDraft.includes(Number(f.id)) ? 'i-lucide-check-square' : 'i-lucide-square'"
                class="size-4 shrink-0" :class="fifoDraft.includes(Number(f.id)) ? 'text-primary' : 'text-dimmed'"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ f.label || '—' }}</span>
                <span class="block truncate text-[11px] text-dimmed font-mono">{{ f.path }}</span>
                <span v-if="f.sampleformat" class="block truncate text-[11px] text-dimmed opacity-70">
                  {{ formatSampleformat(f.sampleformat) }}
                </span>
              </span>
              <UBadge v-if="!f.exists" color="warning" variant="subtle" size="xs">absent</UBadge>
            </button>
          </div>

          <div class="flex items-center justify-between gap-2 border-t border-default pt-3">
            <UButton label="Gérer les FIFO" color="neutral" variant="soft" icon="i-lucide-settings-2" to="/settings/fifo" @click="fifoOpen = false" />
            <div class="flex gap-2">
              <UButton label="Annuler" color="neutral" variant="soft" @click="fifoOpen = false" />
              <UButton label="Enregistrer" color="primary" icon="i-lucide-save" :loading="fifoSaving" @click="saveFifos" />
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal : conf générée (serveur distant) -->
    <UModal v-model:open="confOpen" :title="`Conf à copier — ${confIp}`">
      <template #content>
        <div class="p-5 space-y-3">
          <p class="text-xs text-dimmed">
            Serveur distant : la conf n'a pas été écrite. Copiez-la dans <span class="font-mono">snapserver.conf</span> sur la machine cible.
          </p>
          <UTextarea :model-value="confText" :rows="14" readonly class="w-full font-mono text-xs" />
          <div class="flex items-center justify-end gap-2 border-t border-default pt-3">
            <UButton label="Copier" color="neutral" variant="soft" icon="i-lucide-copy" @click="copyConf" />
            <UButton label="Fermer" color="neutral" variant="soft" @click="confOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal : nouveau serveur -->
    <UModal v-model:open="addOpen" title="Nouveau serveur Snapcast">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="IP"><UInput v-model="form.ip" placeholder="192.168.1.19" class="w-full font-mono" /></UFormField>
            <UFormField label="Port"><UInput v-model.number="form.port" type="number" placeholder="1705" class="w-full" /></UFormField>
          </div>
          <UFormField label="Nom" description="Optionnel."><UInput v-model="form.name" placeholder="Salon" class="w-full" /></UFormField>
          <div class="flex items-center gap-6">
            <USwitch v-model="form.isLocal" label="Serveur local" />
            <USwitch v-model="form.enabled" label="Activé" />
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-default pt-3">
            <UButton label="Annuler" color="neutral" variant="soft" @click="addOpen = false" />
            <UButton label="Ajouter" icon="i-lucide-plus" color="primary" :loading="adding" :disabled="!form.ip.trim()" @click="onCreate" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
