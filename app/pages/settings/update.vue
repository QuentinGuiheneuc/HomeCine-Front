<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  getUpdateState, updateYtdlp, getRepos, addRepo, setRepoEnabled, deleteRepo,
  startInstall, getInstall, toolText, toolOk, formatUptime,
  type UpdateState, type UpdateRepo, type InstallState
} from '@/src/api/update'

definePageMeta({ middleware: 'admin' })

const toast   = useToast()
const pending = ref(false)
const state   = ref<UpdateState>({})
const repos   = ref<UpdateRepo[]>([])
const busy    = ref<string | null>(null)

const tools = computed(() => [
  { key: 'yt-dlp', icon: 'i-lucide-download',   info: state.value.ytdlp },
  { key: 'ffmpeg', icon: 'i-lucide-film',       info: state.value.ffmpeg },
  { key: 'python', icon: 'i-lucide-terminal',   info: state.value.python },
  { key: 'node',   icon: 'i-lucide-hexagon',    info: state.value.node },
])

async function load() {
  pending.value = true
  try {
    const st = await getUpdateState()
    state.value = st
    repos.value = Array.isArray(st.repos) && st.repos.length ? st.repos : await getRepos().catch(() => [])
  } catch {
    toast.add({ title: 'État indisponible', color: 'error' })
  } finally { pending.value = false }
}

/* ── yt-dlp ─────────────────────────────────────────────────────────────── */
async function onUpdateYtdlp() {
  busy.value = 'ytdlp'
  try {
    const res = await updateYtdlp()
    toast.add({
      title: res.changed ? 'yt-dlp mis à jour' : 'yt-dlp déjà à jour',
      description: res.changed ? `${res.avant ?? '?'} → ${res.apres ?? '?'}` : res.apres,
      color: 'success', icon: 'i-lucide-check'
    })
    if (res.sortie) { outTitle.value = 'yt-dlp'; outText.value = res.sortie; outOpen.value = true }
    await load()
  } catch (e: any) {
    toast.add({ title: 'Mise à jour impossible', description: e?.response?.data?.error || 'yt-dlp absent ou échec', color: 'error' })
  } finally { busy.value = null }
}

/* ── install.sh (avec suivi) ────────────────────────────────────────────── */
const installs = ref<Record<number, InstallState | null>>({})
let poll: ReturnType<typeof setInterval> | null = null

const runningIds = computed(() =>
  Object.entries(installs.value).filter(([, s]) => s?.etat === 'en cours').map(([id]) => Number(id))
)

async function refreshInstall(id: number) {
  try { installs.value = { ...installs.value, [id]: await getInstall(id) } } catch { /* noop */ }
}

function ensurePolling() {
  if (poll) return
  poll = setInterval(async () => {
    if (!runningIds.value.length) { clearInterval(poll!); poll = null; return }
    for (const id of runningIds.value) await refreshInstall(id)
  }, 2000)
}

async function onInstall(r: UpdateRepo) {
  busy.value = `inst:${r.id}`
  try {
    await startInstall(r.id)
    toast.add({ title: 'Installation lancée', description: r.nom, color: 'success', icon: 'i-lucide-play' })
    await refreshInstall(r.id)
    ensurePolling()
  } catch (e: any) {
    const st = e?.response?.status
    toast.add({
      title: st === 409 ? 'Déjà en cours' : st === 400 ? 'Pas de install.sh' : 'Lancement impossible',
      description: e?.response?.data?.error, color: st === 409 ? 'warning' : 'error'
    })
    if (st === 409) { await refreshInstall(r.id); ensurePolling() }
  } finally { busy.value = null }
}

/* ── Sortie (yt-dlp / install) ──────────────────────────────────────────── */
const outOpen  = ref(false)
const outTitle = ref('')
const outText  = ref('')

async function showInstall(r: UpdateRepo) {
  await refreshInstall(r.id)
  const st = installs.value[r.id]
  if (!st) { toast.add({ title: 'Jamais lancé', description: r.nom, color: 'neutral' }); return }
  outTitle.value = `${r.nom} — ${st.etat}`
  outText.value  = st.sortie || '(aucune sortie)'
  outOpen.value  = true
}

const etatColor = (e?: string) => e === 'ok' ? 'success' : e === 'echec' ? 'error' : e === 'en cours' ? 'warning' : 'neutral'

/* ── Dépôts ─────────────────────────────────────────────────────────────── */
async function onToggle(r: UpdateRepo, value: boolean) {
  busy.value = `en:${r.id}`
  try { await setRepoEnabled(r.id, value); r.enabled = value }
  catch (e: any) { toast.add({ title: 'Modification impossible', description: e?.response?.data?.error, color: 'error' }) }
  finally { busy.value = null }
}

async function onDelete(r: UpdateRepo) {
  if (!confirm(`Retirer le dépôt « ${r.nom} » du suivi ?`)) return
  busy.value = `del:${r.id}`
  try { await deleteRepo(r.id); await load(); toast.add({ title: 'Dépôt retiré', color: 'success' }) }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
  finally { busy.value = null }
}

const addOpen = ref(false)
const adding  = ref(false)
const form    = ref({ nom: '', path: '', enabled: true })

function openAdd() { form.value = { nom: '', path: '', enabled: true }; addOpen.value = true }

async function onCreate() {
  const nom = form.value.nom.trim(), path = form.value.path.trim()
  if (!nom || !path) { toast.add({ title: 'Nom et chemin requis', color: 'warning' }); return }
  adding.value = true
  try {
    await addRepo({ nom, path, enabled: form.value.enabled })
    addOpen.value = false
    await load()
    toast.add({ title: 'Dépôt ajouté', description: nom, color: 'success', icon: 'i-lucide-git-branch' })
  } catch (e: any) {
    toast.add({ title: 'Ajout impossible', description: e?.response?.data?.error || 'Chemin refusé', color: 'error' })
  } finally { adding.value = false }
}

onMounted(load)
onUnmounted(() => { if (poll) clearInterval(poll) })
</script>

<template>
  <div>
    <UPageCard
      title="Mise à jour"
      description="Versions des outils et dépôts git suivis. L'état des dépôts est local : aucun git fetch n'est fait."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Mettre à jour yt-dlp" color="primary" variant="soft" icon="i-lucide-download" :loading="busy === 'ytdlp'" @click="onUpdateYtdlp" />
        <UButton label="Actualiser" color="neutral" icon="i-lucide-refresh-cw" :loading="pending" @click="load" />
      </div>
    </UPageCard>

    <!-- Outils -->
    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-2">
      <UPageCard v-for="t in tools" :key="t.key" variant="subtle" :ui="{ container: 'p-4 gap-y-1' }">
        <div class="flex items-center gap-2">
          <UIcon :name="t.icon" class="size-4 shrink-0" :class="toolOk(t.info) ? 'text-primary' : 'text-dimmed'" />
          <p class="text-xs text-dimmed">{{ t.key }}</p>
        </div>
        <p class="text-sm font-mono truncate" :class="toolOk(t.info) ? '' : 'text-warning'">{{ toolText(t.info) }}</p>
      </UPageCard>
    </div>

    <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-0' }" class="mb-4">
      <div class="flex items-center gap-2 text-sm">
        <UIcon name="i-lucide-timer" class="size-4 text-dimmed" />
        <span class="text-dimmed">Service démarré depuis</span>
        <span class="font-medium">{{ formatUptime(state.uptimeS) }}</span>
      </div>
    </UPageCard>

    <!-- Dépôts -->
    <UPageCard
      title="Dépôts"
      description="Chaque dépôt peut exécuter son install.sh."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Ajouter un dépôt" color="primary" icon="i-lucide-plus" @click="openAdd" />
      </div>
    </UPageCard>

    <div v-if="pending && !repos.length" class="grid gap-2">
      <USkeleton v-for="i in 2" :key="i" class="h-24 rounded-lg" />
    </div>
    <UPageCard v-else-if="!repos.length" variant="subtle" :ui="{ container: 'p-6' }">
      <p class="text-sm text-dimmed italic text-center">Aucun dépôt suivi.</p>
    </UPageCard>

    <div v-else class="grid gap-2">
      <UPageCard v-for="r in repos" :key="r.id" variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-git-branch" class="size-6 shrink-0" :class="r.erreur ? 'text-error' : r.enabled ? 'text-primary' : 'text-dimmed'" />

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <p class="font-semibold truncate">{{ r.nom }}</p>
              <UBadge v-if="r.branche" color="neutral" variant="subtle" size="xs" class="font-mono">{{ r.branche }}</UBadge>
              <UBadge v-if="r.propre === false" color="warning" variant="subtle" size="xs" icon="i-lucide-triangle-alert">
                modifs non commitées
              </UBadge>
              <UBadge v-if="installs[r.id]?.etat" :color="etatColor(installs[r.id]?.etat)" variant="subtle" size="xs">
                install : {{ installs[r.id]?.etat }}
              </UBadge>
            </div>
            <p class="text-xs text-dimmed font-mono truncate">{{ r.chemin }}</p>
            <p v-if="r.erreur" class="text-xs text-error truncate mt-0.5">{{ r.erreur }}</p>
            <p v-else-if="r.commit" class="text-[11px] text-dimmed font-mono truncate mt-0.5">{{ r.commit }}</p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-dimmed hidden sm:inline">Suivi</span>
            <USwitch :model-value="!!r.enabled" :disabled="busy === `en:${r.id}`" @update:model-value="(v) => onToggle(r, v)" />
          </div>

          <UDropdownMenu
            :items="[[
              { label: 'Lancer install.sh', icon: 'i-lucide-play',       onSelect: () => onInstall(r) },
              { label: 'Voir la sortie',    icon: 'i-lucide-scroll-text', onSelect: () => showInstall(r) },
              { label: 'Retirer du suivi',  icon: 'i-lucide-trash-2',    onSelect: () => onDelete(r) }
            ]]"
          >
            <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" square :loading="busy === `inst:${r.id}` || busy === `del:${r.id}`" />
          </UDropdownMenu>
        </div>
      </UPageCard>
    </div>

    <!-- Modal : sortie -->
    <UModal v-model:open="outOpen" :title="`Sortie — ${outTitle}`">
      <template #content>
        <div class="p-5 space-y-3">
          <UTextarea :model-value="outText" :rows="16" readonly class="w-full font-mono text-xs" />
          <div class="flex justify-end border-t border-default pt-3">
            <UButton label="Fermer" color="neutral" variant="soft" @click="outOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal : ajout d'un dépôt -->
    <UModal v-model:open="addOpen" title="Ajouter un dépôt">
      <template #content>
        <div class="p-6 space-y-4">
          <UFormField label="Nom"><UInput v-model="form.nom" placeholder="HomeCine-Front" class="w-full" /></UFormField>
          <UFormField label="Chemin" description="Chemin absolu du dépôt sur le serveur.">
            <UInput v-model="form.path" placeholder="/home/pi/HomeCine-Front" class="w-full font-mono" />
          </UFormField>
          <USwitch v-model="form.enabled" label="Suivi actif" />
          <div class="flex items-center justify-end gap-2 border-t border-default pt-3">
            <UButton label="Annuler" color="neutral" variant="soft" @click="addOpen = false" />
            <UButton label="Ajouter" icon="i-lucide-plus" color="primary" :loading="adding" :disabled="!form.nom.trim() || !form.path.trim()" @click="onCreate" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
