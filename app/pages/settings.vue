<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const links = [[
  { label: 'General',       icon: 'i-lucide-user',      to: '/settings', exact: true },
  { label: 'Spotify',       icon: 'logos:spotify-icon', to: '/settings/spotify' },
  { label: 'Snap',          icon: 'cbi:snapcast',       to: '/settings/snap' },
  { label: 'Notifications', icon: 'i-lucide-bell',      to: '/settings/notifications' },
  { label: 'Security',      icon: 'i-lucide-shield',    to: '/settings/security' }
], [
  { label: 'Documentation', icon: 'i-lucide-book-open', to: 'https://ui.nuxt.com/docs/getting-started/installation/nuxt', target: '_blank' }
]] satisfies NavigationMenuItem[][]
</script>

<template>
  <!-- Remplace UDashboardPanel -->
  <div id="settings" class="relative flex flex-col min-w-0 min-h-svh flex-1">

    <!-- Header (ne scrolle pas) -->
    <div class="shrink-0 border-b border-default">
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </div>

    <!-- Corps (mêmes classes que :ui="{ body: 'p-0 min-h-0 flex-1' }") -->
    <div class="p-0 min-h-0 flex-1">
      <!-- ✅ Un seul conteneur qui scrolle -->
      <div class="h-[calc(100dvh-var(--ui-header-height)-var(--ui-toolbar-height,49px))] overflow-y-auto overscroll-contain">
        <div class="px-4 sm:px-6 lg:px-8">
          <div class="w-full lg:max-w-2xl mx-auto lg:py-12">
            <NuxtPage />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
