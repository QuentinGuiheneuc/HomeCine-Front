<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getProviders, getSpotifyAuthorizeUrl, getDeezerAuthorizeUrl,
  connectDeezer, setDefaultCredential, deleteCredential,
  type ProviderStatus, type ProviderAccount
} from '@/src/api/credentials'

definePageMeta({ middleware: 'admin' })

const toast   = useToast()
const pending = ref(false)
const providers = ref<ProviderStatus[]>([])

async function load() {
  pending.value = true
  try {
    providers.value = await getProviders()
  } catch {
    toast.add({ title: 'Erreur de chargement des connexions', color: 'error' })
  } finally {
    pending.value = false
  }
}

const providerIcon = (p?: string) =>
  p === 'spotify' ? 'mdi:spotify' : p === 'deezer' ? 'i-simple-icons-deezer' : 'i-lucide-key-round'

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

onMounted(load)
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
          <UBadge
            :color="p.connected ? 'success' : 'neutral'"
            variant="subtle"
            :icon="p.connected ? 'i-lucide-check-circle' : 'i-lucide-circle-dashed'"
          >
            {{ p.connected ? 'Connecté' : 'Non connecté' }}
          </UBadge>
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
  </div>
</template>
