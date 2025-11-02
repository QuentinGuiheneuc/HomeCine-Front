<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useAuth } from '@/composables/useAuth'
import DeviceSlideover from '~/components/DeviceSlideover.vue'

const route = useRoute()
const { isAuthenticated } = useAuth()
const open = ref(false)

const links = [[
  { label: 'Maison', icon: 'i-lucide-house', to: '/', onSelect: () => { open.value = false } },
  { label: 'Inbox', icon: 'i-lucide-inbox', to: '/inbox', badge: '4', onSelect: () => { open.value = false } },
  { label: 'Customers', icon: 'i-lucide-users', to: '/customers', onSelect: () => { open.value = false } },
  { label: 'Spotify', icon: 'mdi:spotify', to: '/spotify', onSelect: () => { open.value = false } },
  { label: 'Snap', icon: 'mdi:spotify', to: '/snap', onSelect: () => { open.value = false } },
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

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.flat()
}, {
  id: 'code',
  label: 'Code',
  items: [{
    id: 'source',
    label: 'View page source',
    icon: 'i-simple-icons-github',
    to: `https://github.com/nuxt-ui-templates/dashboard/blob/main/app/pages${route.path === '/' ? '/index' : route.path}.vue`,
    target: '_blank'
  }]
}])
</script>

<template>
  <!-- Hauteur plein écran + grille dashboard -->
  <UDashboardGroup unit="rem" class="min-h-dvh flex">
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
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

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

    <!-- Contenu principal scrollable -->
    <div class="flex-1 min-h-0 flex-col">
      <UDashboardSearch :groups="groups" />
      <!-- IMPORTANT: permet le scroll interne des pages -->
      <main class=" min-h-0 overflow-y-auto">
        <slot />
      </main>
    </div>

    <NotificationsSlideover />
    <DeviceSlideover />
  </UDashboardGroup>
</template>
