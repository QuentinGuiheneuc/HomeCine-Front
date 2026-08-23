<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getAllLibrespot, getLibrespotState, type LibrespotState } from '@/src/api/librespot'
import { getUsers, type AppUser } from '@/src/api/user'

/**
 * Sélecteur du compte d'authentification (config.tokenUserId).
 * Admin → /user/all (tous les utilisateurs) annotés avec l'état de leur token (/credentials/librespot/all).
 * Sinon → /credentials/librespot (le sien).
 */
defineProps<{ provider?: string }>()
const model = defineModel<number | null>({ default: null })

const { isAdmin } = useCurrentUser()

const users   = ref<AppUser[]>([])
const tokens  = ref<LibrespotState[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    if (isAdmin.value) {
      const [us, ts] = await Promise.all([
        getUsers().catch(() => [] as AppUser[]),
        getAllLibrespot().catch(() => [] as LibrespotState[]),
      ])
      users.value = us
      tokens.value = ts
    } else {
      const mine = await getLibrespotState().catch(() => null)
      tokens.value = mine ? [mine] : []
    }
  } finally { loading.value = false }
}

const tokenByUser = computed(() => {
  const m = new Map<number, LibrespotState>()
  for (const t of tokens.value) if (t.userId != null) m.set(Number(t.userId), t)
  return m
})

function tokenSuffix(userId?: number | null) {
  if (userId == null) return ''
  const t = tokenByUser.value.get(Number(userId))
  if (!t) return ' · sans token'
  return t.connected === false ? ' · déconnecté' : ' · connecté'
}

const items = computed(() => {
  let base: { label: string; value: number }[]
  if (isAdmin.value) {
    base = users.value
      .filter(u => u.id != null)
      .map(u => ({ label: `${u.name || u.email || `user #${u.id}`}${tokenSuffix(u.id)}`, value: Number(u.id) }))
  } else {
    base = tokens.value
      .filter(t => t.userId != null)
      .map(t => ({ label: `${t.user || `user #${t.userId}`}${t.connected === false ? ' · déconnecté' : ''}`, value: Number(t.userId) }))
  }
  // Conserve la valeur courante même si absente de la liste
  if (model.value != null && !base.some(i => i.value === model.value)) {
    base.push({ label: `#${model.value} (actuel)`, value: Number(model.value) })
  }
  return [{ label: '— Aucun —', value: null as number | null }, ...base]
})

const hasOptions = computed(() => items.value.length > 1)

onMounted(load)
</script>

<template>
  <div>
    <label class="text-sm text-dimmed">Compte / Token (tokenUserId)</label>
    <USelect
      :model-value="model ?? null"
      :items="items"
      :loading="loading"
      placeholder="Compte d'authentification"
      class="mt-1 w-full"
      @update:model-value="(v: any) => model = (v == null ? null : Number(v))"
    />
    <p v-if="!hasOptions && !loading" class="text-[11px] text-dimmed mt-1">
      Aucun compte —
      <NuxtLink to="/settings/credentials" class="text-primary underline">connecter</NuxtLink>
    </p>
  </div>
</template>
