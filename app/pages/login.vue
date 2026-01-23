<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm dark:bg-zinc-950 dark:border-zinc-800">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Connexion</h1>
          <p class="mt-1 text-sm text-zinc-500">Connecte-toi pour continuer.</p>
        </div>

        <label class="inline-flex items-center gap-2 cursor-pointer select-none">
          <span class="text-xs text-zinc-600 dark:text-zinc-300">Light</span>

          <button
            type="button"
            role="switch"
            :aria-checked="isDark"
            @click="toggleTheme"
            class="relative h-6 w-11 rounded-full border transition
                   bg-zinc-200 border-zinc-300
                   dark:bg-zinc-800 dark:border-zinc-700"
          >
            <span
              class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              :class="isDark ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>

          <span class="text-xs text-zinc-600 dark:text-zinc-300">Dark</span>
        </label>
      </div>

      <div
        v-if="errorMsg"
        class="mt-4 rounded-xl px-4 py-3 text-sm"
        :style="{
          border: '1px solid var(--ui-error)',
          backgroundColor: 'color-mix(in srgb, var(--ui-error) 12%, white)',
          color: 'var(--ui-error)'
        }"
      >
        {{ errorMsg }}
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="onSubmit">
        <div>
          <label class="block text-sm font-medium text-gray-700">Pseudo</label>
          <input
            v-model.trim="form.username"
            type="text"
            autocomplete="username"
            required
            :disabled="loading"
            class="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            placeholder="admin"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">Mot de passe</label>
          <input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="loading"
            class="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          :disabled="loading || !canSubmit"
          class="w-full rounded-xl px-4 py-2 text-white disabled:opacity-60"
          :style="{ backgroundColor: 'var(--ui-primary)' }"
        >
          <span v-if="!loading">Se connecter</span>
          <span v-else>Connexion…</span>
        </button>
      </form>

      <p class="mt-4 text-xs text-gray-500">
        En cas de souci, contacte l’administrateur.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'

onMounted(() => {
  setToken()
  document.title = 'Login - HomeCine'
})
const { login, isAuthenticated, setToken } = useAuth()
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
watchEffect(() => {
  if (isAuthenticated.value) navigateTo('/')
})

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const errorMsg = ref<string | null>(null)

const canSubmit = computed(() => form.username.trim().length > 0 && form.password.length > 0)

async function onSubmit() {
  errorMsg.value = null
  loading.value = true
  try {
    await login({ email: form.username, password: form.password })
  } catch (err: any) {
    const status = err?.response?.status
    if (status === 401) errorMsg.value = 'Pseudo ou mot de passe incorrect.'
    else if (err?.code === 'ERR_NETWORK') errorMsg.value = 'Serveur injoignable. Vérifie ta connexion.'
    else errorMsg.value = 'Erreur de connexion. Réessaie.'
  } finally {
    loading.value = false
  }
}
</script>
