<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getSnapServers, saveSnapServer, setSnapServerEnabled,
  applySnapServer, deleteSnapServer, serverFifoIds,
  syncSnap, startSnapService, stopSnapService, getSnapServiceStatus,
  type SnapServer, type SnapServerConfig
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

/** Résumé de la conf, pour lire l'essentiel sans ouvrir l'éditeur. Les valeurs
 *  absentes sont les défauts du générateur (cf. SnapServerConfig). */
function resumeConf(s: SnapServer): string {
  const c = s.config ?? {}
  return [
    `flux ${c.stream?.bind ?? '0.0.0.0'}:${c.stream?.port ?? 1704}`,
    c.stream?.codec ?? 'flac',
    c.stream?.sampleformat ?? '48000:16:2',
    `web ${c.http?.enabled === false ? 'off' : (c.http?.port ?? 1780)}`,
  ].join(' · ')
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

/* ── Éditeur : identité + conf complète + FIFO ──────────────────────────────
 *
 * Un seul formulaire pour l'ajout et la modification : POST /snap/servers est
 * un upsert par IP, les deux cas parlent donc à la même route. La conf y est
 * REMPLACÉE en bloc — le brouillon porte toutes les sections, y compris celles
 * laissées vides, pour ne jamais en effacer une par omission.
 */

/** v-model.number rend '' quand le champ est vidé : d'où le type mixte. */
type Champ = number | string | undefined

function brouillonVide() {
  return {
    ip: '', port: 1705 as Champ, name: '', isLocal: false, enabled: true,
    fifos: [] as number[],
    // `fifos: null` en base = liste jamais définie : le serveur local publie
    // alors tous les tubes activés. Enregistrer un [] à la place couperait
    // tous ses flux sans que rien ne l'ait demandé — on garde donc l'état
    // « défaut » tant que la sélection n'a pas été touchée.
    fifosDefaut: false,
    config: {
      server: { buffer: undefined as Champ, datadir: '' },
      http:   { enabled: true, bind: '', port: undefined as Champ, docRoot: '' },
      tcp:    { enabled: true, bind: '', port: undefined as Champ },
      stream: { bind: '', port: undefined as Champ, chunkMs: undefined as Champ, codec: '', sampleformat: '' },
    },
  }
}

const editOpen   = ref(false)
const editSaving = ref(false)
const editIp     = ref('')                 // '' = création
const draft      = ref(brouillonVide())

function openEdit(s: SnapServer | null) {
  const d = brouillonVide()
  if (s) {
    const c = (s.config ?? {}) as SnapServerConfig
    editIp.value  = s.ip
    d.ip          = s.ip
    d.port        = s.port ?? undefined
    d.name        = s.name ?? ''
    d.isLocal     = !!s.isLocal
    d.enabled     = !!s.enabled
    d.fifos       = serverFifoIds(s)
    d.fifosDefaut = s.fifos == null

    d.config.server.buffer       = c.server?.buffer ?? undefined
    d.config.server.datadir      = c.server?.datadir ?? ''
    d.config.http.enabled        = c.http?.enabled !== false
    d.config.http.bind           = c.http?.bind ?? ''
    d.config.http.port           = c.http?.port ?? undefined
    d.config.http.docRoot        = c.http?.docRoot ?? ''
    d.config.tcp.enabled         = c.tcp?.enabled !== false
    d.config.tcp.bind            = c.tcp?.bind ?? ''
    d.config.tcp.port            = c.tcp?.port ?? undefined
    d.config.stream.bind         = c.stream?.bind ?? ''
    d.config.stream.port         = c.stream?.port ?? undefined
    d.config.stream.chunkMs      = c.stream?.chunkMs ?? undefined
    d.config.stream.codec        = c.stream?.codec ?? ''
    d.config.stream.sampleformat = c.stream?.sampleformat ?? ''
  } else {
    editIp.value = ''
  }
  draft.value    = d
  editOpen.value = true
}

function toggleFifo(id: number) {
  const i = draft.value.fifos.indexOf(id)
  if (i >= 0) draft.value.fifos.splice(i, 1)
  else draft.value.fifos.push(id)
  draft.value.fifosDefaut = false   // la liste devient explicite
}

const txt = (v: unknown) => { const s = String(v ?? '').trim(); return s || undefined }
const num = (v: Champ) => {
  // `== null` couvre null ET undefined : selon le composant, un champ vidé
  // rend l'un ou l'autre, ou la chaîne vide.
  if (v == null || String(v).trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
/** Section vidée de ses champs absents ; undefined si elle ne dit plus rien. */
const section = (o: Record<string, unknown>) => {
  const e = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  return Object.keys(e).length ? e : undefined
}

/** Mêmes expressions que le schéma zod du serveur : message immédiat, plutôt
 *  qu'un 400 après coup. */
const RE_HOTE  = /^[A-Za-z0-9.:_-]+$/
const RE_JETON = /^[A-Za-z0-9:_-]+$/

function premierDefaut(): string | null {
  const c = draft.value.config
  const hotes: Array<[string, string]> = [
    ['http.bind', c.http.bind], ['tcp.bind', c.tcp.bind], ['stream.bind', c.stream.bind],
  ]
  for (const [nom, v] of hotes) {
    if (v.trim() && !RE_HOTE.test(v.trim())) return `${nom} : adresse invalide (« ${v.trim()} »)`
  }
  const jetons: Array<[string, string]> = [['codec', c.stream.codec], ['sampleformat', c.stream.sampleformat]]
  for (const [nom, v] of jetons) {
    if (v.trim() && !RE_JETON.test(v.trim())) return `stream.${nom} : valeur invalide (« ${v.trim()} »)`
  }
  const chemins: Array<[string, string]> = [['server.datadir', c.server.datadir], ['http.docRoot', c.http.docRoot]]
  for (const [nom, v] of chemins) {
    if (/[\r\n]/.test(v)) return `${nom} : un chemin ne peut pas contenir de retour à la ligne`
  }
  const cm = num(c.stream.chunkMs)
  if (cm !== undefined && cm <= 0) return 'stream.chunk_ms : durée strictement positive attendue'
  const buf = num(c.server.buffer)
  if (buf !== undefined && buf < 0) return 'server.buffer : valeur négative refusée'
  return null
}

function configPayload(): SnapServerConfig {
  const c = draft.value.config
  const cfg: Record<string, unknown> = {
    server: section({ buffer: num(c.server.buffer), datadir: txt(c.server.datadir) }),
    // `enabled: true` est le défaut : ne l'envoyer que pour couper la section,
    // afin que la conf en base ne dise que ce qui s'écarte des défauts.
    http:   section({ enabled: c.http.enabled ? undefined : false, bind: txt(c.http.bind), port: num(c.http.port), docRoot: txt(c.http.docRoot) }),
    tcp:    section({ enabled: c.tcp.enabled ? undefined : false, bind: txt(c.tcp.bind), port: num(c.tcp.port) }),
    stream: section({ bind: txt(c.stream.bind), port: num(c.stream.port), chunkMs: num(c.stream.chunkMs), codec: txt(c.stream.codec), sampleformat: txt(c.stream.sampleformat) }),
  }
  return Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== undefined)) as SnapServerConfig
}

async function saveServer() {
  const d  = draft.value
  const ip = (editIp.value || d.ip).trim()
  if (!ip) { toast.add({ title: 'IP requise', color: 'warning' }); return }
  if (!RE_HOTE.test(ip)) { toast.add({ title: 'IP invalide', description: ip, color: 'warning' }); return }

  const defaut = premierDefaut()
  if (defaut) { toast.add({ title: 'Valeur refusée', description: defaut, color: 'warning' }); return }

  editSaving.value = true
  try {
    await saveSnapServer({
      ip,
      port:    num(d.port),
      name:    d.name.trim(),          // chaîne vide = nom effacé (undefined le conserverait)
      enabled: d.enabled,
      isLocal: d.isLocal,
      config:  configPayload(),
      fifos:   d.fifosDefaut ? null : [...d.fifos],
    })
    await load()
    editOpen.value = false
    toast.add({
      title: editIp.value ? 'Serveur modifié' : 'Serveur ajouté',
      description: 'Pensez à « Régénérer la conf ».',
      color: 'success', icon: 'i-lucide-save',
    })
  } catch (e: any) {
    // Le serveur renvoie { error, details } (zod) : la première cause est plus
    // parlante que « config invalide ».
    const rep    = e?.response?.data
    const detail = rep?.details?.[0]
    toast.add({
      title: 'Enregistrement impossible',
      description: detail
        ? `${(detail.path ?? []).join('.')} : ${detail.message}`
        : (rep?.error || 'Config ou FIFO invalide'),
      color: 'error',
    })
  } finally { editSaving.value = false }
}

onMounted(load)
</script>

<template>
  <div class="p-4 space-y-4">
    <UPageCard
      title="Serveurs Snapcast"
      description="Chaque serveur porte sa conf et ses FIFO. Enchaînement : FIFO → rattacher → régénérer la conf → démarrer."
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
        <UButton label="Nouveau serveur" color="primary" icon="i-lucide-plus" @click="openEdit(null)" />
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
            <p class="text-[11px] text-dimmed font-mono truncate opacity-70">{{ resumeConf(s) }}</p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-dimmed hidden sm:inline">Activé</span>
            <USwitch :model-value="s.enabled" :disabled="busy === `en:${s.ip}`" @update:model-value="(v) => onToggle(s, v)" />
          </div>

          <UDropdownMenu
            :items="[[
              { label: 'Modifier',        icon: 'i-lucide-settings-2', onSelect: () => openEdit(s) },
              { label: 'Générer la conf', icon: 'i-lucide-file-cog',   onSelect: () => onApply(s) },
              { label: 'Supprimer',       icon: 'i-lucide-trash-2',    onSelect: () => onDelete(s) }
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
          <span v-if="s.fifos == null" class="text-xs text-dimmed italic">par défaut (tous les tubes activés)</span>
          <span v-else-if="!serverFifoIds(s).length" class="text-xs text-dimmed italic">aucun</span>
          <UButton icon="i-lucide-settings-2" size="xs" variant="ghost" color="neutral" class="ms-auto" @click="openEdit(s)">Modifier</UButton>
        </div>
      </UPageCard>
    </div>

    <!-- Modal : serveur (identité + conf + FIFO) -->
    <UModal v-model:open="editOpen" :title="editIp ? `Serveur — ${editIp}` : 'Nouveau serveur Snapcast'">
      <template #content>
        <div class="p-5 space-y-5 max-h-[85vh] overflow-y-auto">

          <!-- Identité -->
          <section class="space-y-3">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">Serveur</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="IP" :description="editIp ? 'Identifiant du serveur — non modifiable ici.' : undefined">
                <UInput v-model="draft.ip" :disabled="!!editIp" placeholder="192.168.1.19" class="w-full font-mono" />
              </UFormField>
              <UFormField label="Port" description="Port de l'API HomeCine de cette machine (relais des requêtes).">
                <UInput v-model.number="draft.port" type="number" placeholder="1780" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Nom" description="Optionnel.">
              <UInput v-model="draft.name" placeholder="Salon" class="w-full" />
            </UFormField>
            <div class="flex items-center gap-6">
              <USwitch v-model="draft.isLocal" label="Serveur local" />
              <USwitch v-model="draft.enabled" label="Activé" />
            </div>
          </section>

          <!-- [stream] : le plus utile, donc en premier -->
          <section class="space-y-3 border-t border-default pt-4">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">[stream] — flux audio</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="bind_to_address">
                <UInput v-model="draft.config.stream.bind" placeholder="0.0.0.0" class="w-full font-mono" />
              </UFormField>
              <UFormField label="port">
                <UInput v-model.number="draft.config.stream.port" type="number" placeholder="1704" class="w-full" />
              </UFormField>
              <UFormField label="chunk_ms" description="Taille de paquet, en ms.">
                <UInput v-model.number="draft.config.stream.chunkMs" type="number" placeholder="10" class="w-full" />
              </UFormField>
              <UFormField label="codec" description="flac, pcm, ogg, opus.">
                <UInput v-model="draft.config.stream.codec" placeholder="flac" class="w-full font-mono" />
              </UFormField>
              <UFormField label="sampleformat" description="Défaut des flux ; un FIFO qui porte le sien l'emporte." class="sm:col-span-2">
                <UInput v-model="draft.config.stream.sampleformat" placeholder="48000:16:2" class="w-full font-mono" />
              </UFormField>
            </div>
          </section>

          <!-- [http] -->
          <section class="space-y-3 border-t border-default pt-4">
            <div class="flex items-center gap-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">[http] — interface web</p>
              <USwitch v-model="draft.config.http.enabled" size="sm" class="ms-auto" />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="bind_to_address">
                <UInput v-model="draft.config.http.bind" placeholder="0.0.0.0" class="w-full font-mono" />
              </UFormField>
              <UFormField label="port">
                <UInput v-model.number="draft.config.http.port" type="number" placeholder="1780" class="w-full" />
              </UFormField>
              <UFormField label="doc_root" description="Dossier servi (snapweb). Optionnel." class="sm:col-span-2">
                <UInput v-model="draft.config.http.docRoot" placeholder="/usr/share/snapserver/snapweb" class="w-full font-mono" />
              </UFormField>
            </div>
          </section>

          <!-- [tcp] -->
          <section class="space-y-3 border-t border-default pt-4">
            <div class="flex items-center gap-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">[tcp] — contrôle JSON-RPC</p>
              <USwitch v-model="draft.config.tcp.enabled" size="sm" class="ms-auto" />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="bind_to_address">
                <UInput v-model="draft.config.tcp.bind" placeholder="127.0.0.1" class="w-full font-mono" />
              </UFormField>
              <UFormField label="port">
                <UInput v-model.number="draft.config.tcp.port" type="number" placeholder="1705" class="w-full" />
              </UFormField>
            </div>
          </section>

          <!-- [server] -->
          <section class="space-y-3 border-t border-default pt-4">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">[server]</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="buffer" description="Tampon de lecture, en ms.">
                <UInput v-model.number="draft.config.server.buffer" type="number" placeholder="0" class="w-full" />
              </UFormField>
              <UFormField label="datadir" description="Dossier d'état de snapserver.">
                <UInput v-model="draft.config.server.datadir" placeholder="/var/lib/snapserver" class="w-full font-mono" />
              </UFormField>
            </div>
          </section>

          <!-- FIFO publiés -->
          <section class="space-y-3 border-t border-default pt-4">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">FIFO publiés</p>
            <p v-if="draft.fifosDefaut" class="text-xs text-dimmed">
              Liste jamais définie : ce serveur publie tous les tubes activés. Cocher un tube fige la sélection.
            </p>
            <p v-else class="text-xs text-dimmed">Cochez les tubes exposés par ce serveur ; aucun coché = aucun flux.</p>

            <p v-if="!fifos.length" class="text-sm text-dimmed italic py-3 text-center">
              Aucun FIFO déclaré — <NuxtLink to="/settings/fifo" class="text-primary underline">en créer un</NuxtLink>
            </p>
            <div v-else class="space-y-1 max-h-[40vh] overflow-y-auto">
              <button
                v-for="f in fifos" :key="f.id"
                class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors border"
                :class="draft.fifos.includes(Number(f.id)) ? 'border-primary bg-primary/10' : 'border-default hover:bg-elevated/50'"
                @click="toggleFifo(Number(f.id))"
              >
                <UIcon
                  :name="draft.fifos.includes(Number(f.id)) ? 'i-lucide-check-square' : 'i-lucide-square'"
                  class="size-4 shrink-0" :class="draft.fifos.includes(Number(f.id)) ? 'text-primary' : 'text-dimmed'"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ f.label || '—' }}</span>
                  <span class="block truncate text-[11px] text-dimmed font-mono">{{ f.path }}</span>
                  <span v-if="f.sampleformat" class="block truncate text-[11px] text-dimmed opacity-70">
                    {{ formatSampleformat(f.sampleformat) }}
                  </span>
                </span>
                <UBadge v-if="!f.enabled" color="neutral" variant="subtle" size="xs">désactivé</UBadge>
                <UBadge v-if="!f.exists" color="warning" variant="subtle" size="xs">absent</UBadge>
              </button>
            </div>
          </section>

          <div class="flex items-center justify-between gap-2 border-t border-default pt-3">
            <UButton label="Gérer les FIFO" color="neutral" variant="soft" icon="i-lucide-settings-2" to="/settings/fifo" @click="editOpen = false" />
            <div class="flex gap-2">
              <UButton label="Annuler" color="neutral" variant="soft" @click="editOpen = false" />
              <UButton
                :label="editIp ? 'Enregistrer' : 'Ajouter'"
                :icon="editIp ? 'i-lucide-save' : 'i-lucide-plus'"
                color="primary" :loading="editSaving"
                :disabled="!editIp && !draft.ip.trim()"
                @click="saveServer"
              />
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
  </div>
</template>
