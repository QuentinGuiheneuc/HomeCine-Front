<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useAuth } from '@/composables/useAuth'
import DeviceSlideover from '~/components/DeviceSlideover.vue'
import DeviceSpotifySlideover from '~/components/DeviceSpotifySlideover.vue'
import DeviceAddSlideover from '~/components/DeviceAddSlideover.vue'
import LecteurSlideover from '~/components/LecteurSlideover.vue'
import LecteurQueueSlideover from '~/components/LecteurQueueSlideover.vue'

const { menue } = useDashboard()
const { isAuthenticated } = useAuth()
const { isAdmin } = useCurrentUser()
const open = menue

const links = computed<NavigationMenuItem[][]>(() => {
  const settingsChildren: NavigationMenuItem[] = [
    { label: 'General',       to: '/settings',               exact: true, onSelect: () => { open.value = false } },
    { label: 'Notifications', to: '/settings/notifications',              onSelect: () => { open.value = false } },
    { label: 'Security',      to: '/settings/security',                   onSelect: () => { open.value = false } },
    ...(isAdmin.value ? [
      { label: 'Members',     to: '/settings/members',                    onSelect: () => { open.value = false } },
      // { label: 'Spotify',     to: '/settings/spotify', icon: 'logos:spotify-icon', onSelect: () => { open.value = false } },
      { label: 'Connexions', to: '/settings/credentials',                 onSelect: () => { open.value = false } },
      { label: 'Navigateurs', to: '/settings/browsers',                   onSelect: () => { open.value = false } },
    ] : [])
  ]

  return [[
    { label: 'Maison',    icon: 'i-lucide-house',        to: '/',        onSelect: () => { open.value = false } },
    {
      label: 'EQ', to: '/eq', icon: 'si:equalizer-fill', defaultOpen: false, type: 'trigger',
      children: [
        { label: 'General', to: '/eq',          exact: true, onSelect: () => { open.value = false } },
        { label: 'Config',  to: '/eqconfig',               onSelect: () => { open.value = false } },
        { label: 'Presset', to: '/eq/presset',             onSelect: () => { open.value = false } }
      ]
    },
    { label: 'Lecteur',   icon: 'simple-icons:gocd',     to: '/lecteurs', onSelect: () => { open.value = false } },
    { label: 'Devices',   icon: 'mdi:speaker',           to: '/devices',  onSelect: () => { open.value = false } },
    { label: 'Musique',   icon: 'i-lucide-music',        to: '/musique',  onSelect: () => { open.value = false } },
    { label: 'Bluetooth', icon: 'i-lucide-bluetooth',    to: '/bt',       onSelect: () => { open.value = false } },
    { label: 'Controle',  icon: 'whh:controlpanelalt',   to: '/control',  onSelect: () => { open.value = false } },
    {
      label: 'Snap', to: '/snap', icon: 'mdi:cast-audio', defaultOpen: false, type: 'trigger',
      children: [
        { label: 'General', to: '/snap',               exact: true, onSelect: () => { open.value = false } },
        { label: 'Config',  to: '/snap/snapconfig',               onSelect: () => { open.value = false } },
        { label: 'Presset', to: '/snap/presset',                  onSelect: () => { open.value = false } }
      ]
    },
    {
      label: 'Settings', to: '/settings', icon: 'i-lucide-settings', defaultOpen: false, type: 'trigger',
      children: settingsChildren
    }
  ], []]
})

const groups = computed(() => [
  {
    id: 'links',
    label: 'Go to',
    items: links.value.flat()
  },
  {
    id: 'code',
    label: 'Code',
    items: [{
      id: 'source',
      label: 'View page source',
      icon: 'i-simple-icons-github',
      to: 'https://github.com/QuentinGuiheneuc/HomeCine-Front',
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
      <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <slot />
      </main>
    </div>

    <NotificationsSlideover />
    <DeviceSlideover />
    <DeviceSpotifySlideover />
    <DeviceAddSlideover />
    <LecteurSlideover />
    <LecteurQueueSlideover />
  </UDashboardGroup>
</template>
