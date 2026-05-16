<script setup lang="ts">
const { preferences, pushSubscribed, loading, saving, loadPreferences, persistPreferences, checkPushStatus, enablePush, disablePush } = useNotifications()

onMounted(async () => {
  await loadPreferences()
  await checkPushStatus()
})

async function onTogglePush(val: boolean) {
  if (val) await enablePush()
  else await disablePush()
}

async function onChange() {
  await persistPreferences()
}

const channelSections = computed(() => [{
  title: 'Canaux de notification',
  description: 'Par où recevoir les notifications ?',
  fields: [
    {
      name: 'inApp',
      label: 'Toast in-app',
      description: 'Notifications en bas de l\'écran pendant la navigation.'
    },
    {
      name: 'email',
      label: 'Email',
      description: 'Recevoir un résumé par email.'
    }
  ]
}])

const eventSections = computed(() => [{
  title: 'Événements',
  description: 'Quels événements déclenchent une notification ?',
  fields: [
    { name: 'device_online',  label: 'Appareil connecté',     description: 'Un lecteur passe en ligne.' },
    { name: 'device_offline', label: 'Appareil déconnecté',   description: 'Un lecteur se déconnecte.' },
    { name: 'error',          label: 'Erreur serveur/device', description: 'Erreur critique détectée.' },
    { name: 'unauthorized',   label: 'Accès non autorisé',    description: 'Tentative d\'accès refusée.' },
    { name: 'update',         label: 'Mise à jour',           description: 'Une mise à jour est disponible.' },
    { name: 'track_change',   label: 'Changement de piste',   description: 'La musique en cours change.' }
  ]
}])
</script>

<template>
  <div v-if="loading" class="flex justify-center py-10">
    <UIcon name="i-lucide-loader-circle" class="animate-spin text-2xl text-muted" />
  </div>

  <template v-else>
    <!-- Push navigateur -->
    <div class="mb-4">
      <UPageCard
        title="Notifications push"
        description="Recevoir des notifications système, même onglet en arrière-plan."
        variant="naked"
        class="mb-4"
      />
      <UPageCard variant="subtle">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-medium text-sm text-highlighted">Navigateur push</p>
            <p class="text-sm text-dimmed">
              {{ pushSubscribed ? 'Activé sur ce navigateur' : 'Désactivé — cliquez pour activer' }}
            </p>
          </div>
          <USwitch
            :model-value="pushSubscribed"
            @update:model-value="onTogglePush"
          />
        </div>
      </UPageCard>
    </div>

    <!-- Canaux -->
    <div v-for="(section, i) in channelSections" :key="i" class="mb-4">
      <UPageCard :title="section.title" :description="section.description" variant="naked" class="mb-4" />
      <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
        <UFormField
          v-for="field in section.fields"
          :key="field.name"
          :name="field.name"
          :label="field.label"
          :description="field.description"
          class="flex items-center justify-between not-last:pb-4 gap-2"
        >
          <USwitch
            v-model="(preferences.channels as any)[field.name]"
            @update:model-value="onChange"
          />
        </UFormField>
      </UPageCard>
    </div>

    <!-- Événements -->
    <div v-for="(section, i) in eventSections" :key="'e' + i" class="mb-4">
      <UPageCard :title="section.title" :description="section.description" variant="naked" class="mb-4" />
      <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
        <UFormField
          v-for="field in section.fields"
          :key="field.name"
          :name="field.name"
          :label="field.label"
          :description="field.description"
          class="flex items-center justify-between not-last:pb-4 gap-2"
        >
          <USwitch
            v-model="(preferences.events as any)[field.name]"
            @update:model-value="onChange"
          />
        </UFormField>
      </UPageCard>
    </div>

    <div class="flex justify-end">
      <UButton
        label="Sauvegarder"
        :loading="saving"
        @click="onChange"
      />
    </div>
  </template>
</template>
