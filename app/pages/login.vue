<template>
  <UContainer class="py-10 max-w-md">
    <UCard>
      <template #header>
        <h1 class="text-xl font-semibold">
          Connexion
        </h1>
      </template>

      <UAlert v-if="msg" class="mb-2" :title="msg" color="warning" />

      <UForm class="space-y-3" :state="form" @submit="onSubmit">
        <UFormGroup label="Email" name="email">
          <UInput v-model="form.email" required />
        </UFormGroup>
        <UFormGroup label="Mot de passe" name="password">
          <UInput v-model="form.password" type="password" required />
        </UFormGroup>
        <UButton type="submit" block>
          Se connecter
        </UButton>
      </UForm>
    </UCard>
  </UContainer>
</template>

<script setup lang="ts">
import { useAuth } from '@/composables/useAuth'

const { login, uiMessage } = useAuth()
const form = reactive({ email: '', password: '' })
const msg = computed(() => uiMessage.value)

async function onSubmit() {
  await login({ email: form.email, password: form.password })
}
</script>
