<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useAuth } from '@/composables/useAuth'
import DeviceSlideover from '~/components/DeviceSlideover.vue'
import DeviceSpotifySlideover from '~/components/DeviceSpotifySlideover.vue'

const { menue } = useDashboard()

const route = useRoute()
const { isAuthenticated } = useAuth()
const open = menue

const links = [[
  { label: 'Maison', icon: 'i-lucide-house', to: '/', onSelect: () => { open.value = false } },
  { label: 'EQ', icon: 'si:equalizer-fill', to: '/eq', onSelect: () => { open.value = false } },
  { label: 'Lecteur', icon: 'simple-icons:gocd', to: '/lecteur', onSelect: () => { open.value = false } },

  { label: 'Devices', icon: 'mdi:speaker', to: '/devices', onSelect: () => { open.value = false } },
  { label: 'Spotify', icon: 'mdi:spotify', to: '/spotify', onSelect: () => { open.value = false } },
  { label: 'Snap', icon: 'mdi:cast-audio', to: '/snap', onSelect: () => { open.value = false } },
  {
    label: 'Settings', to: '/settings', icon: 'i-lucide-settings', defaultOpen: false, type: 'trigger',
    children: [
      { label: 'General', to: '/settings', exact: true, onSelect: () => { open.value = false } },
      { label: 'Members', to: '/settings/members', onSelect: () => { open.value = false } },
      { icon: 'logos:spotify-icon', label: 'Spotify', to: '/settings/spotify', onSelect: () => { open.value = false } },
      { icon: 'mdi:cast-audio', label: 'Snap', to: '/settings/snap', onSelect: () => { open.value = false } },
      { label: 'Notifications', to: '/settings/notifications', onSelect: () => { open.value = false } },
      { label: 'Security', to: '/settings/security', onSelect: () => { open.value = false } }
    ]
  }
], []] satisfies NavigationMenuItem[][]

const groups = computed(() => [
  {
    id: 'links',
    label: 'Go to',
    items: links.flat()
  },
  {
    id: 'code',
    label: 'Code',
    items: [{
      id: 'source',
      label: 'View page source',
      icon: 'i-simple-icons-github',
      to: `https://github.com/nuxt-ui-templates/dashboard/blob/main/app/pages${route.path === '/' ? '/index' : route.path}.vue`,
      target: '_blank'
    }]
  }
])
</script>

<template>
  <!-- Layout global : prend toute la hauteur, flex horizontal -->
  <UDashboardGroup unit="rem" class="min-h-dvh flex">
    <!-- SIDEBAR -->
    <UDashboardSidebar
      v-if="isAuthenticated"
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          class="bg-transparent ring-default"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <!-- CONTENU PRINCIPAL -->
    <!-- ⬅️ ICI: flex + flex-col + min-h-0 pour autoriser le scroll interne -->
    <div class="flex-1 min-h-0 flex flex-col">
      <!-- Barre de recherche globale (fixe en haut de la colonne) -->
      <UDashboardSearch :groups="groups" />

      <!-- Zone scrollable qui contient les pages -->
      <!-- ⬅️ flex-1 + overflow-y-auto = le coeur du scroll -->
      <main class="flex-1 min-h-0 overflow-y-auto">
        <slot />
      </main>
    </div>

    <NotificationsSlideover />
    <DeviceSlideover />
    <DeviceSpotifySlideover/>
  </UDashboardGroup>
</template>
