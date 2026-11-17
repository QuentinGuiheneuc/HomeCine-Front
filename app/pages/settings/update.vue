<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  getUpdateState, updateYtdlp, addRepo, setRepoEnabled, deleteRepo,
  startInstall, getInstall, toolText, toolOk, formatUptime, verifBadge,
  type UpdateState, type UpdateRepo, type InstallState
} from '@/src/api/update'
import { getOta, fetchOta, updateOta, otaEtat, type OtaDepot, type OtaClient } from '@/src/api/ota'

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
    repos.value = st.repos ?? []
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
    // 400 : `indice` donne la commande à lancer quand yt-dlp vient de pip, à afficher tel quel
    toast.add({ title: 'Mise à jour impossible', description: e?.response?.data?.indice ?? apiError(e, 'yt-dlp absent ou échec'), color: 'error' })
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
    for (const id of runningIds.value) {
      await refreshInstall(id)
      const st = installs.value[id]
      if (st?.etat === 'en cours') continue
      // terminé, ou suivi perdu (install.sh a redémarré le serveur) : relire les dépôts, montrer la sortie
      load()
      if (st) openSortie(st.repo ?? String(id), st)
    }
  }, 2000)
}

async function onInstall(r: UpdateRepo) {
  if (r.id == null) return
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
      description: apiError(e), color: st === 409 ? 'warning' : 'error'
    })
    if (st === 409) { await refreshInstall(r.id); ensurePolling() }
  } finally { busy.value = null }
}

/* ── Sortie (yt-dlp / install) ──────────────────────────────────────────── */
const outOpen  = ref(false)
const outTitle = ref('')
const outText  = ref('')

async function showInstall(r: UpdateRepo) {
  if (r.id == null) return
  await refreshInstall(r.id)
  const st = installs.value[r.id]
  if (!st) { toast.add({ title: 'Jamais lancé', description: r.nom, color: 'neutral' }); return }
  openSortie(r.nom, st)
}

function openSortie(nom: string, st: InstallState) {
  outTitle.value = `${nom} — ${st.etat}`
  outText.value = st.sortie || '(aucune sortie)'
  outOpen.value = true
}

const etatColor = (e?: string) => e === 'ok' ? 'success' : e === 'echec' ? 'error' : e === 'en cours' ? 'warning' : 'neutral'

/* ── Dépôts ─────────────────────────────────────────────────────────────── */
async function onToggle(r: UpdateRepo, value: boolean) {
  if (r.id == null) return
  busy.value = `en:${r.id}`
  // puis relire GET /update : activer fait apparaître branche, commit et vérification
  try { await setRepoEnabled(r.id, value); r.enabled = value; await load() }
  catch (e: any) { toast.add({ title: 'Modification impossible', description: apiError(e), color: 'error' }) }
  finally { busy.value = null }
}

async function onDelete(r: UpdateRepo) {
  if (r.id == null || !confirm(`Retirer le dépôt « ${r.nom} » du suivi ?`)) return
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
    toast.add({ title: 'Ajout impossible', description: apiError(e, 'Chemin refusé'), color: 'error' })
  } finally { adding.value = false }
}

/* ── OTA des HP (HomeCine-Client), cf. HomeCine-Serv/docs/ota.md ────────── */
const ota = ref<{ depot: OtaDepot | null, clients: OtaClient[] }>({ depot: null, clients: [] })
const otaPending = ref(false)
const otaErreur = ref<string | null>(null)
/* HP à qui une mise à jour a été demandée : suivis jusqu'à leur retour à jour */
const otaAttente = ref(new Set<string>())
// `pret` : même règle que pretPourMaj côté serveur (GET /ota/client/status), calculée sur les
// données déjà lues ici pour ne pas interroger chaque HP deux fois : ni en cours, ni API muette, ni à jour.
const otaRows = computed(() => ota.value.clients.map(c => ({
  ...c,
  etat: otaEtat(c.resultat),
  pret: !c.resultat?.enCours && !c.erreur && !c.aJour
})))
let otaPoll: ReturnType<typeof setInterval> | null = null
let otaDepuis = 0
// shortcut: défaut du serveur (OTA_UPDATE_TIMEOUT_MS, npm install compris) ; à lire depuis le serveur s'il change
const OTA_SUIVI_MAX_MS = 15 * 60_000

async function loadOta() {
  otaPending.value = true
  try {
    ota.value = await getOta()
    otaErreur.value = null
    for (const c of ota.value.clients) {
      const r = c.resultat
      // fin du suivi : revenu à jour, refusé ou en échec, déjà à jour, ou sans redémarrage automatique
      if (c.aJour || r?.ok === false || r?.inchange || r?.redemarrage === false) otaAttente.value.delete(c.ip)
    }
  } catch (e) {
    otaErreur.value = apiError(e, 'OTA indisponible')
  } finally { otaPending.value = false }
}

/* Relit l'état toutes les 3 s tant qu'un HP télécharge, installe ou redémarre. */
function suivreOta() {
  otaDepuis = Date.now()
  if (otaPoll) return
  otaPoll = setInterval(() => {
    const actif = otaAttente.value.size || ota.value.clients.some(c => c.resultat?.enCours)
    if (!actif || Date.now() - otaDepuis > OTA_SUIVI_MAX_MS) {
      clearInterval(otaPoll!)
      otaPoll = null
      otaAttente.value.clear()
      return
    }
    if (!otaPending.value) loadOta()
  }, 3000)
}

async function onOtaFetch() {
  busy.value = 'ota:fetch'
  try {
    const depot = await fetchOta()
    toast.add({ title: 'Dernière version récupérée', description: `${depot.commit.slice(0, 7)} ${depot.sujet ?? ''}`, color: 'success', icon: 'i-lucide-git-pull-request' })
    await loadOta()
  } catch (e) {
    toast.add({ title: 'Récupération impossible', description: apiError(e), color: 'error' })
  } finally { busy.value = null }
}

async function onOtaUpdate(ip?: string, force = false) {
  const qui = ip ?? 'tous les HP connectés'
  if (!confirm(`${force ? 'Forcer' : 'Lancer'} la mise à jour de ${qui} ?\nLe HP redémarre : le son qu'il joue est coupé quelques secondes.`)) return
  busy.value = `ota:${ip ?? '*'}`
  try {
    const res = await updateOta(ip, force)
    res.envoye.forEach(x => otaAttente.value.add(x))
    toast.add({
      title: res.envoye.length ? 'Mise à jour lancée' : 'Aucun HP connecté',
      description: res.envoye.join(', '),
      color: res.envoye.length ? 'success' : 'warning', icon: 'i-lucide-download'
    })
    await loadOta()
    suivreOta()
  } catch (e) {
    toast.add({ title: 'Mise à jour impossible', description: apiError(e), color: 'error' })
  } finally { busy.value = null }
}

onMounted(() => {
  load()
  loadOta()
})
onUnmounted(() => {
  if (poll) clearInterval(poll)
  if (otaPoll) clearInterval(otaPoll)
})
</script>

<template>
  <div>
    <UPageCard
      title="Mise à jour"
      description="Versions des outils et dépôts git suivis. Le serveur vérifie chaque heure le retard des dépôts activés sur leur origine, sans rien installer."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Mettre à jour yt-dlp" color="primary" variant="soft" icon="i-lucide-download" :loading="busy === 'ytdlp'" @click="onUpdateYtdlp" />
        <UButton label="Actualiser" color="neutral" icon="i-lucide-refresh-cw" :loading="pending || otaPending" @click="load(); loadOta()" />
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
      <UPageCard v-for="r in repos" :key="r.chemin" variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-git-branch" class="size-6 shrink-0" :class="r.erreur ? 'text-error' : r.enabled ? 'text-primary' : 'text-dimmed'" />

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <p class="font-semibold truncate">{{ r.nom }}</p>
              <UBadge v-if="r.branche" color="neutral" variant="subtle" size="xs" class="font-mono">{{ r.branche }}</UBadge>
              <UBadge v-if="r.propre === false" color="warning" variant="subtle" size="xs" icon="i-lucide-triangle-alert">
                modifs non commitées
              </UBadge>
              <UTooltip v-if="verifBadge(r.verification)" :text="verifBadge(r.verification)!.info">
                <UBadge
                  :color="verifBadge(r.verification)!.color"
                  variant="subtle"
                  size="xs"
                  icon="i-lucide-git-compare"
                >
                  {{ verifBadge(r.verification)!.label }}
                </UBadge>
              </UTooltip>
              <UBadge v-if="r.id != null && installs[r.id]?.etat" :color="etatColor(installs[r.id]?.etat)" variant="subtle" size="xs">
                install : {{ installs[r.id]?.etat }}
              </UBadge>
            </div>
            <p class="text-xs text-dimmed font-mono truncate">{{ r.chemin }}</p>
            <p v-if="r.erreur" class="text-xs text-error truncate mt-0.5">{{ r.erreur }}</p>
            <p v-else-if="r.commit" class="text-[11px] text-dimmed font-mono truncate mt-0.5">{{ r.commit }}</p>
          </div>

          <UButton
            v-if="r.id != null && r.verification?.enRetard"
            label="Installer"
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-play"
            class="shrink-0"
            :loading="busy === `inst:${r.id}`"
            @click="onInstall(r)"
          />
          <div v-if="r.id != null" class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-dimmed hidden sm:inline">Suivi</span>
            <USwitch :model-value="!!r.enabled" :disabled="busy === `en:${r.id}`" @update:model-value="(v) => onToggle(r, v)" />
          </div>

          <UDropdownMenu
            v-if="r.id != null"
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

    <!-- OTA des HP -->
    <UPageCard
      title="Clients (OTA)"
      description="Version de HomeCine-Client que le serveur distribue aux HP. Une mise à jour redémarre le HP : le son qu'il joue est coupé quelques secondes."
      variant="naked"
      orientation="horizontal"
      class="mt-6 mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton
          label="Récupérer"
          color="neutral"
          variant="soft"
          icon="i-lucide-git-pull-request"
          :loading="busy === 'ota:fetch'"
          @click="onOtaFetch"
        />
        <UButton
          label="Tout mettre à jour"
          color="primary"
          icon="i-lucide-download"
          :loading="busy === 'ota:*'"
          :disabled="!otaRows.some(c => c.connecte && c.pret)"
          @click="onOtaUpdate()"
        />
      </div>
    </UPageCard>

    <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-1' }" class="mb-2">
      <p v-if="otaErreur" class="text-sm text-error">
        {{ otaErreur }}
      </p>
      <USkeleton v-else-if="!ota.depot" class="h-10" />
      <template v-else>
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <UIcon name="i-lucide-package" class="size-4 text-primary shrink-0" />
          <span class="text-xs text-dimmed">Version distribuée</span>
          <span class="font-mono text-sm">{{ ota.depot.commit.slice(0, 7) }}</span>
          <UBadge
            v-if="ota.depot.branche"
            color="neutral"
            variant="subtle"
            size="xs"
            class="font-mono"
          >
            {{ ota.depot.branche }}
          </UBadge>
          <span v-if="ota.depot.date" class="text-xs text-dimmed">{{ new Date(ota.depot.date).toLocaleString() }}</span>
        </div>
        <p v-if="ota.depot.sujet" class="text-xs text-dimmed truncate">
          {{ ota.depot.sujet }}
        </p>
      </template>
    </UPageCard>

    <UPageCard v-if="ota.depot && !otaRows.length" variant="subtle" :ui="{ container: 'p-6' }">
      <p class="text-sm text-dimmed italic text-center">
        Aucun HP connecté.
      </p>
    </UPageCard>
    <div v-else class="grid gap-2">
      <UPageCard
        v-for="c in otaRows"
        :key="c.ip"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-2' }"
      >
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-speaker" class="size-6 shrink-0" :class="c.aJour ? 'text-primary' : c.connecte ? 'text-warning' : 'text-dimmed'" />

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0 flex-wrap">
              <p class="font-semibold font-mono">
                {{ c.ip }}
              </p>
              <UBadge :color="c.connecte ? 'success' : 'neutral'" variant="subtle" size="xs">
                {{ c.connecte ? 'connecté' : 'hors ligne' }}
              </UBadge>
              <UBadge
                v-if="c.aJour"
                color="success"
                variant="subtle"
                size="xs"
                icon="i-lucide-check"
              >
                à jour
              </UBadge>
              <UBadge
                v-if="c.etat"
                :color="c.etat.color"
                variant="subtle"
                size="xs"
                :icon="c.resultat?.enCours ? 'i-lucide-loader-circle' : undefined"
              >
                {{ c.etat.label }}
              </UBadge>
              <UBadge
                v-if="otaAttente.has(c.ip) && c.resultat?.ok && !c.aJour"
                color="warning"
                variant="subtle"
                size="xs"
              >
                redémarrage…
              </UBadge>
            </div>
            <p class="text-[11px] text-dimmed font-mono truncate">
              {{ c.commit ? c.commit.slice(0, 7) : c.erreur ? '' : 'jamais mis à jour par l\'OTA' }}
            </p>
            <p v-if="c.erreur" class="text-xs text-warning truncate">
              {{ c.erreur }}
            </p>
            <p v-if="c.resultat?.ok === false && c.resultat.erreur" class="text-xs text-error">
              {{ c.resultat.erreur }}
            </p>
            <p v-if="c.etat?.conseil" class="text-xs text-dimmed">
              {{ c.etat.conseil }}
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <UButton
              v-if="c.etat?.recuperer"
              label="Récupérer"
              size="xs"
              color="neutral"
              variant="soft"
              :loading="busy === 'ota:fetch'"
              @click="onOtaFetch"
            />
            <UButton
              v-if="c.etat?.forcer"
              label="Forcer"
              size="xs"
              color="warning"
              variant="soft"
              :loading="busy === `ota:${c.ip}`"
              @click="onOtaUpdate(c.ip, true)"
            />
            <UButton
              v-if="!c.aJour"
              label="Mettre à jour"
              size="xs"
              color="primary"
              :disabled="!c.pret"
              :loading="busy === `ota:${c.ip}`"
              @click="onOtaUpdate(c.ip)"
            />
          </div>
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
