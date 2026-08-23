<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getProviders, getSpotifyAuthorizeUrl, getDeezerAuthorizeUrl,
  connectDeezer, setDefaultCredential, deleteCredential,
  type ProviderStatus, type ProviderAccount
} from '@/src/api/credentials'
import {
  getKeys, setProviderKeys, deleteProviderKeys,
  type KeysMap, type ProviderKeys
} from '@/src/api/appkey'
import {
  getLibrespotAuthorizeUrl, exchangeLibrespot, verifyLibrespot, getLibrespotState, deleteLibrespot,
  getAllLibrespot, verifyLibrespotUser, deleteLibrespotUser,
  type LibrespotState
} from '@/src/api/librespot'
import {
  getProviders as getLibraryProviders, setProviderPublic, reindex,
  getRoots, addRoot as apiAddRoot, deleteRoot as apiDeleteRoot,
  type LibraryProvider
} from '@/src/api/library'
import { useProtocols, type ProtocolView } from '@/composables/useProtocols'

definePageMeta({ middleware: 'admin' })

const toast   = useToast()
const pending = ref(false)
const providers = ref<ProviderStatus[]>([])

/* État « public » par source (depuis /library/providers) */
const libProviders = ref<LibraryProvider[]>([])
const publicBusy   = ref<string | null>(null)

function isPublic(source: string) {
  return libProviders.value.find(p => (p.source ?? p.id) === source)?.public ?? false
}

async function togglePublic(source: string, value: boolean) {
  publicBusy.value = source
  try {
    await setProviderPublic(source, value)
    const p = libProviders.value.find(lp => (lp.source ?? lp.id) === source)
    if (p) p.public = value
    toast.add({ title: value ? 'Source publique' : 'Source privée', description: source, color: 'success' })
  } catch {
    toast.add({ title: 'Modification impossible', color: 'error' })
  } finally {
    publicBusy.value = null
  }
}

async function load() {
  pending.value = true
  try {
    const [creds, lib] = await Promise.all([
      getProviders(),
      getLibraryProviders().catch(() => [] as LibraryProvider[]),
    ])
    providers.value = creds
    libProviders.value = lib
  } catch {
    toast.add({ title: 'Erreur de chargement des connexions', color: 'error' })
  } finally {
    pending.value = false
  }
}

/* ── Sources de bibliothèque (/library/providers) ───────────────────────── */
const sourceKey     = (p: LibraryProvider) => String(p.source ?? p.id)
const playerCount   = (p: LibraryProvider) =>
  Array.isArray(p.lecteurId) ? p.lecteurId.length : (p.lecteurId != null ? 1 : 0)
const sourceIcon    = (s: string) =>
  s === 'spotify' ? 'mdi:spotify'
  : s === 'deezer' ? 'i-simple-icons-deezer'
  : s === 'youtube' ? 'mdi:youtube'
  : s === 'soundcloud' ? 'i-simple-icons-soundcloud'
  : s === 'tidal' ? 'i-simple-icons-tidal'
  : s === 'fileplayer' ? 'mdi:file-music'
  : s === 'playlist' ? 'i-lucide-list-music'
  : 'i-lucide-database'

const reindexBusy = ref<string | null>(null)
async function reindexSource(p: LibraryProvider) {
  const source = sourceKey(p)
  reindexBusy.value = source
  try {
    await reindex(source as any)
    toast.add({ title: 'Réindexation lancée', description: source, color: 'success', icon: 'i-lucide-refresh-cw' })
  } catch {
    toast.add({ title: 'Réindexation impossible', description: source, color: 'error' })
  } finally { reindexBusy.value = null }
}

const providerIcon = (p?: string) =>
  p === 'spotify' ? 'mdi:spotify' : p === 'deezer' ? 'i-simple-icons-deezer' : p === 'youtube' ? 'mdi:youtube' : 'i-lucide-key-round'

/* ── OAuth générique (popup, repli redirection) ─────────────────────────── */
const connecting = ref<string | null>(null)   // provider en cours

async function runOAuth(provider: string, getUrl: () => Promise<string>) {
  connecting.value = provider
  try {
    const url = await getUrl()
    const popup = window.open(url, `${provider}-auth`, 'width=520,height=720')
    if (!popup) { window.location.href = url; return }
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer)
        connecting.value = null
        load()
      }
    }, 800)
  } catch {
    toast.add({ title: `Connexion ${provider} impossible`, color: 'error' })
    connecting.value = null
  }
}

const connectSpotify     = () => runOAuth('spotify', async () => (await getSpotifyAuthorizeUrl()).url)
const connectDeezerOAuth = () => { deezerOpen.value = false; runOAuth('deezer', async () => (await getDeezerAuthorizeUrl(deezerLabel.value.trim() || undefined)).url) }

/* ── Deezer : modal (OAuth ou ARL) ──────────────────────────────────────── */
const deezerOpen    = ref(false)
const deezerArl     = ref('')
const deezerLabel   = ref('')
const connectingDeezer = ref(false)

function openDeezer() {
  deezerArl.value = ''
  deezerLabel.value = ''
  deezerOpen.value = true
}

async function submitDeezer() {
  if (!deezerArl.value.trim()) return
  connectingDeezer.value = true
  try {
    const res = await connectDeezer(deezerArl.value.trim(), deezerLabel.value.trim() || undefined)
    if (res?.ok) {
      toast.add({ title: 'Deezer connecté', description: res.user, color: 'success', icon: 'i-lucide-check' })
      deezerOpen.value = false
      await load()
    } else {
      toast.add({ title: 'ARL invalide', color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'ARL invalide', description: e?.response?.data?.error, color: 'error' })
  } finally {
    connectingDeezer.value = false
  }
}

/* ── Action de connexion selon le provider ──────────────────────────────── */
function onConnect(p: ProviderStatus) {
  if (p.provider === 'spotify') connectSpotify()
  else if (p.provider === 'deezer') openDeezer()
  else toast.add({ title: `Connexion « ${p.provider} » non gérée`, color: 'warning' })
}

/* ── Actions par compte ─────────────────────────────────────────────────── */
const accountBusy = ref<string | null>(null)

async function makeDefault(a: ProviderAccount) {
  if (a.id == null) return
  accountBusy.value = `def:${a.id}`
  try {
    await setDefaultCredential(a.id)
    toast.add({ title: 'Compte par défaut défini', description: a.user || a.label || String(a.id), color: 'success' })
    await load()
  } catch {
    toast.add({ title: 'Opération impossible', color: 'error' })
  } finally { accountBusy.value = null }
}

async function disconnect(a: ProviderAccount) {
  if (a.id == null) return
  if (!confirm(`Déconnecter le compte « ${a.user || a.label || a.id} » ?`)) return
  accountBusy.value = `del:${a.id}`
  try {
    await deleteCredential(a.id)
    toast.add({ title: 'Compte déconnecté', color: 'success' })
    await load()
  } catch {
    toast.add({ title: 'Déconnexion impossible', color: 'error' })
  } finally { accountBusy.value = null }
}

/* ── Clés d'application (config par provider) — UModal via icône réglages ──── */
const keysMap     = ref<KeysMap>({})
const keysPending = ref(false)
const keysOpen    = ref(false)                       // modal de gestion
const keysView    = ref<'list' | 'form'>('list')     // chooser ↔ formulaire
const keyBusy     = ref(false)

const keyProvider = ref('')                          // provider en cours d'édition
const keyForm     = ref<Record<string, any>>({})     // valeurs éditables (plain + secrets vides)
const keyPlain    = ref<string[]>([])                // champs texte (clientId, redirectUri, username…)
const keySecret   = ref<{ key: string; set: boolean; hint: string }[]>([])  // secrets (clientSecret, token…)

const keyProviders = computed(() => Object.keys(keysMap.value))

/** Libellé lisible d'un champ (clientId → « Client ID ») */
function fieldLabel(k: string) {
  return ({
    clientId: 'Client ID', clientSecret: 'Client secret', redirectUri: 'Redirect URI',
    token: 'Token', apiKey: 'API key', username: 'Username', appId: 'App ID',
  } as Record<string, string>)[k]
    ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
}

async function loadKeys() {
  keysPending.value = true
  try { keysMap.value = await getKeys() } catch { /* noop */ }
  finally { keysPending.value = false }
}

function openKeys(provider?: string) {
  keysOpen.value = true
  loadKeys().then(() => { if (provider) editProvider(provider); else keysView.value = 'list' })
  if (provider) editProvider(provider)   // affiche le formulaire sans attendre le réseau
}

/** Construit le formulaire à partir des clés (masquées) du provider */
function editProvider(provider: string) {
  const pk: ProviderKeys = keysMap.value[provider] ?? {}
  const plain: string[] = []
  const secret: { key: string; set: boolean; hint: string }[] = []
  for (const k of Object.keys(pk)) {
    if (k === 'enabled' || k.endsWith('Hint')) continue
    if (k.endsWith('Set')) { const base = k.slice(0, -3); secret.push({ key: base, set: !!pk[k], hint: pk[`${base}Hint`] ?? '' }); continue }
    plain.push(k)
  }
  const f: Record<string, any> = { enabled: !!pk.enabled }
  for (const k of plain)  f[k] = pk[k] ?? ''
  for (const s of secret) f[s.key] = ''     // secrets vides : on n'écrit que si saisis
  keyForm.value = f
  keyPlain.value = plain
  keySecret.value = secret
  keyProvider.value = provider
  keysView.value = 'form'
}

async function saveProvider() {
  const provider = keyProvider.value
  if (!provider) return
  const payload: Record<string, any> = { enabled: !!keyForm.value.enabled }
  for (const k of keyPlain.value) payload[k] = keyForm.value[k]
  for (const s of keySecret.value) {
    const v = String(keyForm.value[s.key] ?? '').trim()
    if (v) payload[s.key] = v               // secret laissé vide = conservé
  }
  keyBusy.value = true
  try {
    await setProviderKeys(provider, payload)
    toast.add({ title: 'Clés enregistrées', description: provider, color: 'success', icon: 'i-lucide-key-round' })
    await loadKeys()
    keysView.value = 'list'
  } catch (e: any) {
    toast.add({ title: 'Enregistrement impossible', description: e?.response?.data?.error, color: 'error' })
  } finally { keyBusy.value = false }
}

async function clearProvider() {
  const provider = keyProvider.value
  if (!provider) return
  if (!confirm(`Effacer les clés « ${provider} » (et désactiver) ?`)) return
  keyBusy.value = true
  try {
    await deleteProviderKeys(provider)
    toast.add({ title: 'Clés effacées', description: provider, color: 'success' })
    await loadKeys()
    keysView.value = 'list'
  } catch {
    toast.add({ title: 'Suppression impossible', color: 'error' })
  } finally { keyBusy.value = false }
}

/* ── Dossiers racines FilePlayer (CRUD granulaire) ──────────────────────── */
const roots     = ref<string[]>([])
const newRoot   = ref('')
const rootsBusy = ref(false)

async function loadRoots() {
  try { roots.value = await getRoots() } catch { /* noop */ }
}
async function onAddRoot() {
  const root = newRoot.value.trim()
  if (!root || roots.value.includes(root)) return
  rootsBusy.value = true
  try {
    await apiAddRoot(root)
    newRoot.value = ''
    await loadRoots()   // recharge la liste effective renvoyée par le serveur
    toast.add({ title: 'Dossier ajouté', description: root, color: 'success', icon: 'i-lucide-folder-plus' })
  } catch {
    toast.add({ title: 'Ajout impossible', color: 'error' })
  } finally { rootsBusy.value = false }
}
async function onRemoveRoot(root: string) {
  if (!confirm(`Retirer le dossier « ${root} » ?`)) return
  rootsBusy.value = true
  try {
    await apiDeleteRoot(root)
    await loadRoots()
    toast.add({ title: 'Dossier retiré', description: root, color: 'success' })
  } catch {
    toast.add({ title: 'Suppression impossible', color: 'error' })
  } finally { rootsBusy.value = false }
}

/* ── Protocoles audio / services (Snapcast / VBAN / DLNA…) ───────────────── */
const { protocols, setEnabled } = useProtocols()
const protocolBusy = ref<string | null>(null)

async function toggleProtocol(p: ProtocolView, value: boolean) {
  protocolBusy.value = p.name
  try {
    await setEnabled(p.name, value)
    toast.add({ title: value ? `${p.label} activé` : `${p.label} désactivé`, color: value ? 'success' : 'neutral' })
  } catch {
    toast.add({ title: 'Modification impossible', color: 'error' })
  } finally { protocolBusy.value = null }
}

/* ── Spotify (librespot) : token utilisateur + admin ─────────────────────── */
const lsState     = ref<LibrespotState | null>(null)
const lsAll       = ref<LibrespotState[]>([])
const lsPending   = ref(false)
const lsConnecting = ref(false)
const lsBusy      = ref<string | null>(null)   // clé d'action en cours

/** Statut lisible d'un token librespot */
function lsStatus(t: LibrespotState | null | undefined): { label: string; color: 'success' | 'warning' | 'error'; icon: string; expires?: string } | null {
  if (!t) return null
  const expired = t.expiresAt != null && t.expiresAt < Date.now()
  const expires = t.expiresAt != null ? new Date(t.expiresAt).toLocaleString() : undefined
  if (!t.connected) return { label: 'Déconnecté', color: 'error', icon: 'i-lucide-unplug', expires }
  if (expired)      return { label: 'Expiré',      color: 'warning', icon: 'i-lucide-clock-alert', expires }
  if (!t.verified)  return { label: 'Non vérifié', color: 'warning', icon: 'i-lucide-shield-alert', expires }
  return { label: 'Connecté', color: 'success', icon: 'i-lucide-shield-check', expires }
}

async function loadLibrespot() {
  lsPending.value = true
  try {
    const [mine, all] = await Promise.all([
      getLibrespotState().catch(() => null),
      getAllLibrespot().catch(() => [] as LibrespotState[]),
    ])
    lsState.value = mine
    lsAll.value = all
  } finally { lsPending.value = false }
}

/* Connexion manuelle : 1) récupérer l'URL d'authorize  2) coller l'URL de redirection → exchange */
const lsModalOpen   = ref(false)
const lsAuthUrl     = ref('')
const lsAuthState   = ref<string | undefined>(undefined)
const lsRedirectUrl = ref('')
const lsExchanging  = ref(false)

function lsOpenConnect() {
  lsAuthUrl.value = ''
  lsAuthState.value = undefined
  lsRedirectUrl.value = ''
  lsModalOpen.value = true
}

/** Étape 1 : récupère l'URL d'autorisation Spotify */
async function lsGetAuthUrl() {
  lsConnecting.value = true
  try {
    const { url, state } = await getLibrespotAuthorizeUrl()
    lsAuthUrl.value = url
    lsAuthState.value = state
  } catch {
    toast.add({ title: 'Autorisation impossible', color: 'error' })
  } finally { lsConnecting.value = false }
}

/** Étape 2 : envoie l'URL de redirection (…/login?code=…) à l'exchange */
async function lsExchange() {
  const redirectUrl = lsRedirectUrl.value.trim()
  if (!redirectUrl) { toast.add({ title: 'URL de redirection requise', color: 'warning' }); return }
  lsExchanging.value = true
  try {
    await exchangeLibrespot({ redirectUrl, state: lsAuthState.value })
    toast.add({ title: 'Spotify connecté', color: 'success', icon: 'i-lucide-check' })
    lsModalOpen.value = false
    await loadLibrespot()
  } catch (e: any) {
    toast.add({ title: 'Échange impossible', description: e?.response?.data?.error, color: 'error' })
  } finally { lsExchanging.value = false }
}

async function lsCopyAuthUrl() {
  try { await navigator.clipboard.writeText(lsAuthUrl.value); toast.add({ title: 'Lien copié', color: 'neutral' }) }
  catch { /* noop */ }
}

async function lsVerify() {
  lsBusy.value = 'verify'
  try {
    const r = await verifyLibrespot()
    await loadLibrespot()                      // recharge l'état complet (verify ne renvoie que { valid })
    toast.add(r?.valid === false
      ? { title: 'Token invalide', color: 'warning' }
      : { title: 'Token vérifié', color: 'success' })
  } catch { toast.add({ title: 'Vérification impossible', color: 'error' }) }
  finally { lsBusy.value = null }
}
async function lsDisconnect() {
  if (!confirm('Déconnecter votre token Spotify (librespot) ?')) return
  lsBusy.value = 'del'
  try { await deleteLibrespot(); await loadLibrespot(); toast.add({ title: 'Token supprimé', color: 'success' }) }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
  finally { lsBusy.value = null }
}

/* Admin : par user */
async function lsVerifyUser(u: LibrespotState) {
  if (u.userId == null) return
  lsBusy.value = `uv:${u.userId}`
  try { await verifyLibrespotUser(u.userId); await loadLibrespot(); toast.add({ title: 'Token vérifié', description: `user #${u.userId}`, color: 'success' }) }
  catch { toast.add({ title: 'Vérification impossible', color: 'error' }) }
  finally { lsBusy.value = null }
}
async function lsDeleteUser(u: LibrespotState) {
  if (u.userId == null) return
  if (!confirm(`Supprimer le token Spotify du user #${u.userId} ?`)) return
  lsBusy.value = `ud:${u.userId}`
  try { await deleteLibrespotUser(u.userId); await loadLibrespot(); toast.add({ title: 'Token supprimé', description: `user #${u.userId}`, color: 'success' }) }
  catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
  finally { lsBusy.value = null }
}

onMounted(() => { load(); loadRoots(); loadLibrespot() })
</script>

<template>
  <div>
    <UPageCard
      title="Connexions"
      description="Comptes d'authentification par service. Les lecteurs lisent ces accès automatiquement."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Clés d'application" color="neutral" variant="soft" icon="i-lucide-settings-2" @click="openKeys()" />
        <UButton label="Actualiser" color="neutral" icon="i-lucide-refresh-cw" :loading="pending" @click="load" />
      </div>
    </UPageCard>

    <div v-if="pending && !providers.length" class="grid gap-4 sm:grid-cols-2">
      <USkeleton v-for="i in 2" :key="i" class="h-32 rounded-lg" />
    </div>

    <div v-else class="grid gap-2 lg:grid-cols-5">
      <UPageCard
        v-for="p in providers"
        :key="p.provider"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-3' }"
      >
        <!-- En-tête provider -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon :name="providerIcon(p.provider)" class="size-7 shrink-0" />
            <div class="min-w-0">
              <p class="font-semibold capitalize truncate">{{ p.provider }}</p>
              <p class="text-xs text-dimmed">
                {{ p.accounts.length }} compte{{ p.accounts.length > 1 ? 's' : '' }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UBadge
              :color="p.connected ? 'success' : 'neutral'"
              variant="subtle"
              :icon="p.connected ? 'i-lucide-check-circle' : 'i-lucide-circle-dashed'"
            >
              {{ p.connected ? 'Connecté' : 'Non connecté' }}
            </UBadge>
            <UButton
              icon="i-lucide-settings-2" size="xs" color="neutral" variant="ghost"
              title="Clés d'application"
              @click="openKeys(p.provider)"
            />
          </div>
        </div>

        <!-- Visibilité publique -->
        <div class="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/20">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon :name="isPublic(p.provider) ? 'i-lucide-globe' : 'i-lucide-lock'" class="size-4 text-dimmed shrink-0" />
            <div class="min-w-0">
              <p class="text-sm">Source publique</p>
              <p class="text-[11px] text-dimmed">Ressources publiques, sans authentification (ou combinées au compte).</p>
            </div>
          </div>
          <USwitch
            :model-value="isPublic(p.provider)"
            :disabled="publicBusy === p.provider"
            @update:model-value="(v) => togglePublic(p.provider, v)"
          />
        </div>

        <!-- Comptes liés -->
        <div v-if="p.accounts.length" class="space-y-1">
          <div
            v-for="(a, i) in p.accounts"
            :key="a.id ?? i"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-sm"
          >
            <UIcon name="i-lucide-user-round" class="size-4 text-dimmed shrink-0" />
            <span class="truncate flex-1">{{ a.user || a.label || `Compte #${a.id ?? i + 1}` }}</span>
            <UBadge v-if="a.isDefault" color="success" variant="subtle" size="xs" label="Défaut" />
            <UButton
              v-else-if="a.id != null"
              icon="i-lucide-star" size="2xs" color="neutral" variant="ghost"
              :loading="accountBusy === `def:${a.id}`"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              title="Définir par défaut"
              @click="makeDefault(a)"
            />
            <UButton
              v-if="a.id != null"
              icon="i-lucide-unplug" size="2xs" color="error" variant="ghost"
              :loading="accountBusy === `del:${a.id}`"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              title="Déconnecter"
              @click="disconnect(a)"
            />
          </div>
        </div>
        <p v-else class="text-sm text-dimmed italic">Aucun compte lié.</p>

        <!-- Bouton de connexion -->
        <div class="pt-1">
          <UButton
            :icon="p.provider === 'spotify' ? 'mdi:spotify' : p.provider === 'deezer' ? 'i-simple-icons-deezer' : 'i-lucide-plug'"
            :color="p.connected ? 'neutral' : 'primary'"
            :variant="p.connected ? 'soft' : 'solid'"
            :loading="connecting === p.provider"
            block
            @click="onConnect(p)"
          >
            {{ p.connected ? 'Reconnecter / ajouter un compte' : 'Connecter' }}
          </UButton>
        </div>
      </UPageCard>
    </div>

    <!-- ── Spotify (librespot) : token utilisateur + admin ─────────────────── -->
    <UPageCard
      title="Spotify (librespot)"
      description="Token Spotify par utilisateur (utilisé par les lecteurs). Connectez votre compte ou gérez ceux des autres."
      variant="naked"
      orientation="horizontal"
      class="mt-6 mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Actualiser" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="lsPending" @click="loadLibrespot" />
      </div>
    </UPageCard>

    <div class="grid gap-2 lg:grid-cols-5">
      <!-- Mon token -->
      <UPageCard variant="subtle" class="lg:col-span-2" :ui="{ container: 'p-4 gap-y-3' }">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon name="mdi:spotify" class="size-7 shrink-0" />
            <div class="min-w-0">
              <p class="font-semibold truncate">Mon compte</p>
              <p class="text-xs text-dimmed truncate">{{ lsState?.user || (lsState?.userId != null ? `user #${lsState.userId}` : 'Non connecté') }}</p>
            </div>
          </div>
          <UTooltip v-if="lsStatus(lsState)" :text="lsStatus(lsState)?.expires ? `Expire : ${lsStatus(lsState)?.expires}` : ''">
            <UBadge :color="lsStatus(lsState)!.color" variant="subtle" :icon="lsStatus(lsState)!.icon">{{ lsStatus(lsState)!.label }}</UBadge>
          </UTooltip>
          <UBadge v-else color="neutral" variant="subtle" icon="i-lucide-circle-dashed">Non connecté</UBadge>
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <UButton icon="mdi:spotify" color="primary" @click="lsOpenConnect">
            {{ lsState ? 'Reconnecter' : 'Connecter' }}
          </UButton>
          <UButton v-if="lsState" icon="i-lucide-shield-check" color="neutral" variant="soft" :loading="lsBusy === 'verify'" @click="lsVerify">Vérifier</UButton>
          <UButton v-if="lsState" icon="i-lucide-unplug" color="error" variant="soft" :loading="lsBusy === 'del'" @click="lsDisconnect">Déconnecter</UButton>
        </div>
      </UPageCard>

      <!-- Tous les tokens (admin) -->
      <UPageCard variant="subtle" class="lg:col-span-3" :ui="{ container: 'p-4 gap-y-3' }">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium flex items-center gap-2"><UIcon name="i-lucide-users" class="size-4 text-primary" />Tous les tokens<UBadge color="neutral" variant="subtle" size="xs">{{ lsAll.length }}</UBadge></p>
        </div>
        <div v-if="lsPending && !lsAll.length" class="space-y-1"><USkeleton v-for="i in 3" :key="i" class="h-9 rounded-md" /></div>
        <p v-else-if="!lsAll.length" class="text-sm text-dimmed italic">Aucun token enregistré.</p>
        <div v-else class="space-y-1 max-h-72 overflow-y-auto">
          <div v-for="u in lsAll" :key="u.userId ?? u.user ?? Math.random()" class="group flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-sm">
            <UIcon name="i-lucide-user-round" class="size-4 text-dimmed shrink-0" />
            <span class="truncate flex-1">{{ u.user || `user #${u.userId}` }}</span>
            <UTooltip v-if="lsStatus(u)" :text="lsStatus(u)?.expires ? `Expire : ${lsStatus(u)?.expires}` : ''">
              <UBadge :color="lsStatus(u)!.color" variant="subtle" size="xs" :icon="lsStatus(u)!.icon">{{ lsStatus(u)!.label }}</UBadge>
            </UTooltip>
            <UButton
              icon="i-lucide-shield-check" size="2xs" color="neutral" variant="ghost"
              :loading="lsBusy === `uv:${u.userId}`"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              title="Vérifier" @click="lsVerifyUser(u)"
            />
            <UButton
              icon="i-lucide-trash-2" size="2xs" color="error" variant="ghost"
              :loading="lsBusy === `ud:${u.userId}`"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              title="Supprimer" @click="lsDeleteUser(u)"
            />
          </div>
        </div>
      </UPageCard>
    </div>

    <!-- ── Sources de bibliothèque (/library/providers) ────────────────────── -->
    <UPageCard
      title="Sources"
      description="Sources de la bibliothèque : état, visibilité et lecteurs rattachés."
      variant="naked"
      orientation="horizontal"
      class="mt-6 mb-4"
    />

    <p v-if="!libProviders.length" class="text-sm text-dimmed italic">Aucune source.</p>

    <div v-else class="grid gap-2 lg:grid-cols-5">
      <UPageCard
        v-for="p in libProviders"
        :key="sourceKey(p)"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-3' }"
      >
        <!-- En-tête source -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon :name="sourceIcon(sourceKey(p))" class="size-7 shrink-0 text-primary" />
            <div class="min-w-0">
              <p class="font-semibold capitalize truncate">{{ p.name || sourceKey(p) }}</p>
              <p class="text-xs text-dimmed">{{ playerCount(p) }} lecteur{{ playerCount(p) > 1 ? 's' : '' }}</p>
            </div>
          </div>
          <UBadge
            :color="p.active ? 'success' : 'neutral'"
            variant="subtle"
            :icon="p.active ? 'i-lucide-check-circle' : 'i-lucide-circle-dashed'"
          >
            {{ p.active ? 'Active' : 'Inactive' }}
          </UBadge>
        </div>

        <!-- Visibilité (lecture seule ici) -->
        <div class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/20 text-sm">
          <UIcon :name="p.public ? 'i-lucide-globe' : 'i-lucide-lock'" class="size-4 text-dimmed shrink-0" />
          <span class="flex-1">{{ p.public ? 'Source publique' : 'Source privée' }}</span>
        </div>

        <!-- Réindexer (si supporté) -->
        <div v-if="p.canReindex" class="pt-1 mt-auto">
          <UButton
            icon="i-lucide-refresh-cw" color="neutral" variant="soft" block
            :loading="reindexBusy === sourceKey(p)"
            @click="reindexSource(p)"
          >Réindexer</UButton>
        </div>
      </UPageCard>
    </div>

    <!-- ── Stockage local (FilePlayer) ─────────────────────────────────────── -->
    <UPageCard
      title="Stockage local"
      description="Dossiers racines scannés pour la bibliothèque FilePlayer."
      variant="naked"
      orientation="horizontal"
      class="mt-6 mb-4"
    />

    <div class="grid gap-2 lg:grid-cols-5">
      <UPageCard variant="subtle" class="lg:col-span-3" :ui="{ container: 'p-4 gap-y-3' }">
        <!-- En-tête (style provider) -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon name="mdi:file-music" class="size-7 shrink-0 text-primary" />
            <div class="min-w-0">
              <p class="font-semibold truncate">FilePlayer</p>
              <p class="text-xs text-dimmed">{{ roots.length }} dossier{{ roots.length > 1 ? 's' : '' }}</p>
            </div>
          </div>
          <UBadge :color="roots.length ? 'success' : 'neutral'" variant="subtle" icon="i-lucide-folder">
            {{ roots.length ? 'Configuré' : 'Vide' }}
          </UBadge>
        </div>

        <!-- Dossiers (style « comptes ») -->
        <div v-if="roots.length" class="space-y-1">
          <div
            v-for="r in roots"
            :key="r"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-sm"
          >
            <UIcon name="i-lucide-folder" class="size-4 text-dimmed shrink-0" />
            <span class="truncate flex-1 font-mono">{{ r }}</span>
            <UButton
              icon="i-lucide-trash-2" size="2xs" color="error" variant="ghost"
              :disabled="rootsBusy"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click="onRemoveRoot(r)"
            />
          </div>
        </div>
        <p v-else class="text-sm text-dimmed italic">Aucun dossier configuré.</p>

        <!-- Ajout -->
        <div class="flex items-center gap-2 pt-1">
          <UInput v-model="newRoot" placeholder="/data/music" class="flex-1" @keyup.enter="onAddRoot" />
          <UButton icon="i-lucide-plus" color="primary" :loading="rootsBusy" :disabled="!newRoot.trim()" @click="onAddRoot">Ajouter</UButton>
        </div>
      </UPageCard>
    </div>

    <!-- ── Protocoles audio (Snapcast / VBAN / DLNA…) ──────────────────────── -->
    <UPageCard
      title="Protocoles audio"
      description="Diffusion / multiroom. Activez les protocoles utilisés sur votre réseau."
      variant="naked"
      orientation="horizontal"
      class="mt-6 mb-4"
    />

    <p v-if="!protocols.length" class="text-sm text-dimmed italic">Aucun service disponible.</p>

    <div v-else class="grid gap-2 lg:grid-cols-5">
      <UPageCard
        v-for="p in protocols"
        :key="p.name"
        variant="subtle"
        :ui="{ container: 'p-4 gap-y-3' }"
      >
        <!-- En-tête protocole -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0">
            <UIcon :name="p.icon" class="size-7 shrink-0 text-primary" />
            <div class="min-w-0">
              <p class="font-semibold truncate">{{ p.label }}</p>
            </div>
          </div>
          <UBadge
            :color="!p.available ? 'error' : p.running ? 'success' : p.enabled ? 'warning' : 'neutral'"
            variant="subtle"
            :icon="p.running ? 'i-lucide-check-circle' : 'i-lucide-circle-dashed'"
          >
            {{ !p.available ? 'Indisponible' : p.running ? 'Actif' : p.enabled ? 'Activé' : 'Arrêté' }}
          </UBadge>
        </div>

        <p v-if="p.description" class="text-xs text-dimmed">{{ p.description }}</p>

        <!-- Activation -->
        <div class="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/20 mt-auto">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon :name="p.enabled ? 'i-lucide-power' : 'i-lucide-power-off'" class="size-4 text-dimmed shrink-0" />
            <p class="text-sm">Activer</p>
          </div>
          <USwitch
            :model-value="p.enabled"
            :disabled="!p.available || protocolBusy === p.name"
            @update:model-value="(v) => toggleProtocol(p, v)"
          />
        </div>
      </UPageCard>
    </div>

    <!-- Modal Connexion Spotify (librespot) -->
    <UModal v-model:open="lsModalOpen" title="Connecter Spotify (librespot)">
      <template #content>
        <div class="p-6 space-y-4">
          <!-- Étape 1 : lien d'autorisation -->
          <div class="rounded-lg border border-default p-3 space-y-2">
            <p class="text-sm font-medium">1. Autorisation Spotify</p>
            <p class="text-xs text-dimmed">Générez le lien, ouvrez‑le et autorisez l'accès.</p>
            <UButton
              v-if="!lsAuthUrl"
              icon="mdi:spotify" color="primary" block
              :loading="lsConnecting" @click="lsGetAuthUrl"
            >Générer le lien d'autorisation</UButton>

            <template v-else>
              <div class="flex items-center gap-2">
                <UInput :model-value="lsAuthUrl" readonly class="flex-1 font-mono text-xs" />
                <UButton icon="i-lucide-copy" color="neutral" variant="soft" title="Copier" @click="lsCopyAuthUrl" />
              </div>
              <UButton icon="i-lucide-external-link" color="primary" variant="soft" block :to="lsAuthUrl" target="_blank" external>
                Ouvrir l'autorisation Spotify
              </UButton>
            </template>
          </div>

          <!-- Étape 2 : URL de redirection → exchange -->
          <div class="rounded-lg border border-default p-3 space-y-2">
            <p class="text-sm font-medium">2. URL de redirection</p>
            <p class="text-xs text-dimmed">Après autorisation, collez l'URL complète où vous avez été redirigé (…/login?code=…).</p>
            <UInput v-model="lsRedirectUrl" placeholder="http://127.0.0.1:8898/login?code=…" class="w-full font-mono text-xs" />
            <UButton
              icon="i-lucide-check" color="primary" block
              :loading="lsExchanging" :disabled="!lsRedirectUrl.trim()"
              @click="lsExchange"
            >Connecter</UButton>
          </div>

          <div class="flex justify-end pt-2 border-t border-default">
            <UButton label="Fermer" color="neutral" variant="soft" icon="i-lucide-x" @click="lsModalOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal Deezer (ARL) -->
    <UModal v-model:open="deezerOpen" title="Connecter Deezer">
      <template #content>
        <div class="p-6 space-y-4">
          <UFormField label="Label" description="Nom lisible pour ce compte (commun aux deux méthodes).">
            <UInput v-model="deezerLabel" placeholder="perso" class="w-full" />
          </UFormField>

          <!-- Méthode 1 : OAuth -->
          <div class="rounded-lg border border-default p-3 space-y-2">
            <p class="text-sm font-medium">Connexion officielle (OAuth)</p>
            <p class="text-xs text-dimmed">Recommandé — redirige vers Deezer pour autoriser l'accès.</p>
            <UButton
              icon="i-simple-icons-deezer" color="primary" block
              :loading="connecting === 'deezer'"
              @click="connectDeezerOAuth"
            >Se connecter via Deezer</UButton>
          </div>

          <USeparator label="ou" />

          <!-- Méthode 2 : ARL -->
          <div class="rounded-lg border border-default p-3 space-y-2">
            <p class="text-sm font-medium">Connexion par ARL (streaming)</p>
            <p class="text-xs text-dimmed">Collez le cookie ARL. Stocké côté serveur, jamais réaffiché.</p>
            <UInput v-model="deezerArl" type="password" placeholder="ARL Deezer…" class="w-full" />
            <UButton
              label="Connecter via ARL" icon="i-lucide-plug" color="neutral" block
              :loading="connectingDeezer"
              :disabled="!deezerArl.trim()"
              @click="submitDeezer"
            />
          </div>

          <div class="flex justify-end pt-2 border-t border-default">
            <UButton label="Fermer" color="neutral" variant="soft" icon="i-lucide-x" @click="deezerOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal Clés d'application (config par provider) -->
    <UModal
      v-model:open="keysOpen"
      :title="keysView === 'form' ? `Clés — ${keyProvider}` : 'Clés d\'application'"
    >
      <template #content>
        <!-- Vue CHOOSER : liste des providers -->
        <div v-if="keysView === 'list'" class="p-6 space-y-3">
          <p class="text-xs text-dimmed">Configuration OAuth / tokens par provider. Les secrets sont masqués.</p>

          <div v-if="keysPending && !keyProviders.length" class="space-y-1">
            <USkeleton v-for="i in 4" :key="i" class="h-10 rounded-md" />
          </div>
          <p v-else-if="!keyProviders.length" class="text-sm text-dimmed italic py-2">Aucun provider.</p>
          <div v-else class="space-y-1 max-h-[55vh] overflow-y-auto">
            <button
              v-for="prov in keyProviders"
              :key="prov"
              class="w-full flex items-center gap-3 px-2 py-2 rounded-md bg-muted/30 text-sm text-left hover:bg-muted/50 transition-colors"
              @click="editProvider(prov)"
            >
              <UIcon :name="sourceIcon(prov)" class="size-5 shrink-0" />
              <span class="font-medium capitalize flex-1 truncate">{{ prov }}</span>
              <UBadge :color="keysMap[prov]?.enabled ? 'success' : 'neutral'" variant="subtle" size="xs">
                {{ keysMap[prov]?.enabled ? 'Activé' : 'Désactivé' }}
              </UBadge>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0" />
            </button>
          </div>

          <div class="flex justify-end pt-3 border-t border-default">
            <UButton label="Fermer" color="neutral" variant="soft" icon="i-lucide-x" @click="keysOpen = false" />
          </div>
        </div>

        <!-- Vue FORMULAIRE : un provider -->
        <div v-else class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <UIcon :name="sourceIcon(keyProvider)" class="size-7 shrink-0" />
            <p class="font-semibold capitalize flex-1 truncate">{{ keyProvider }}</p>
            <USwitch v-model="keyForm.enabled" label="Activé" />
          </div>

          <!-- Champs texte (clientId, redirectUri, username…) -->
          <UFormField v-for="k in keyPlain" :key="k" :label="fieldLabel(k)">
            <UInput v-model="keyForm[k]" class="w-full" :class="k === 'clientId' || k === 'redirectUri' ? 'font-mono' : ''" />
          </UFormField>

          <!-- Secrets (clientSecret, token…) : vide = conservé -->
          <UFormField
            v-for="s in keySecret" :key="s.key"
            :label="fieldLabel(s.key)"
            :description="s.set ? `Déjà défini (${s.hint || '••••'}) — laisser vide pour conserver.` : 'Non défini.'"
          >
            <UInput v-model="keyForm[s.key]" type="password" :placeholder="s.set ? (s.hint || '••••••••') : 'valeur…'" class="w-full" />
          </UFormField>

          <div class="flex items-center justify-between pt-3 border-t border-default">
            <div class="flex gap-2">
              <UButton label="Retour" color="neutral" variant="soft" icon="i-lucide-arrow-left" @click="keysView = 'list'" />
              <UButton label="Effacer" color="error" variant="soft" icon="i-lucide-trash-2" :loading="keyBusy" @click="clearProvider" />
            </div>
            <UButton label="Enregistrer" icon="i-lucide-save" color="primary" :loading="keyBusy" @click="saveProvider" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
