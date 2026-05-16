<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatTimeAgo } from '@vueuse/core'
import {
  getBrowsers, getBrowserLogs, getGlobalLogs,
  revokeBrowser, restoreBrowser
} from '@/src/api/admin'
import type { BrowserSession, BrowserLog } from '@/src/api/admin'

const UBadge  = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const toast   = useToast()
const pending = ref(false)

// ── Navigateurs ──────────────────────────────────────────────────────────────

const browsers  = ref<BrowserSession[]>([])
const searchBr  = ref('')

async function loadBrowsers() {
  pending.value = true
  try {
    browsers.value = await getBrowsers()
  } catch {
    toast.add({ title: 'Erreur de chargement des navigateurs', color: 'error' as any })
  } finally {
    pending.value = false
  }
}

const filteredBrowsers = computed(() =>
  browsers.value.filter(b =>
    b.browser.includes(searchBr.value.toLowerCase()) ||
    b.userEmail.toLowerCase().includes(searchBr.value.toLowerCase()) ||
    b.ikey.toLowerCase().includes(searchBr.value.toLowerCase())
  )
)

async function toggleRevoke(b: BrowserSession) {
  try {
    if (b.revoked) await restoreBrowser(b.id)
    else await revokeBrowser(b.id)
    toast.add({
      title: b.revoked ? 'Navigateur restauré' : 'Navigateur révoqué',
      color: b.revoked ? 'success' as any : 'warning' as any
    })
    await loadBrowsers()
  } catch {
    toast.add({ title: 'Erreur lors de l\'opération', color: 'error' as any })
  }
}

const browserColumns = [
  { accessorKey: 'ikey',      header: 'IKEY' },
  { accessorKey: 'browser',   header: 'Navigateur' },
  { accessorKey: 'userEmail', header: 'Utilisateur' },
  {
    accessorKey: 'lastSeen',
    header: 'Dernière activité',
    cell: ({ row }: any) => formatTimeAgo(new Date(row.original.lastSeen))
  },
  {
    accessorKey: 'revoked',
    header: 'Statut',
    cell: ({ row }: any) => h(UBadge, {
      label:   row.original.revoked ? 'Révoqué' : 'Actif',
      color:   row.original.revoked ? 'error'   : 'success',
      variant: 'subtle'
    })
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }: any) => h('div', { class: 'flex gap-2' }, [
      h(UButton, {
        label: 'Logs',
        size: 'xs',
        color: 'neutral',
        variant: 'soft',
        icon: 'i-lucide-scroll-text',
        onClick: () => openBrowserLogs(row.original)
      }),
      h(UButton, {
        label:   row.original.revoked ? 'Restaurer' : 'Révoquer',
        size:    'xs',
        color:   row.original.revoked ? 'success'   : 'error',
        variant: 'soft',
        icon:    row.original.revoked ? 'i-lucide-check-circle' : 'i-lucide-ban',
        onClick: () => toggleRevoke(row.original)
      })
    ])
  }
]

// ── Logs d'un navigateur (modal) ─────────────────────────────────────────────

const logsOpen       = ref(false)
const selectedBr     = ref<BrowserSession | null>(null)
const browserLogs    = ref<BrowserLog[]>([])
const loadingLogs    = ref(false)

async function openBrowserLogs(b: BrowserSession) {
  selectedBr.value  = b
  logsOpen.value    = true
  loadingLogs.value = true
  try {
    browserLogs.value = await getBrowserLogs(b.id)
  } catch {
    toast.add({ title: 'Erreur de chargement des logs', color: 'error' as any })
  } finally {
    loadingLogs.value = false
  }
}

const logColumns = [
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }: any) => formatTimeAgo(new Date(row.original.date))
  },
  { accessorKey: 'action', header: 'Action' },
  { accessorKey: 'url',    header: 'URL' },
  { accessorKey: 'ip',     header: 'IP' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const s = row.original.status
      if (!s) return '-'
      return h(UBadge, {
        label:   String(s),
        color:   s < 300 ? 'success' : s < 400 ? 'info' : 'error',
        variant: 'subtle'
      })
    }
  }
]

// ── Journal global ────────────────────────────────────────────────────────────

const globalLogs      = ref<BrowserLog[]>([])
const filterBrowserId = ref('')
const filterUserId    = ref('')
const loadingGlobal   = ref(false)

async function loadGlobalLogs() {
  loadingGlobal.value = true
  try {
    globalLogs.value = await getGlobalLogs({
      browserId: filterBrowserId.value || undefined,
      userId:    filterUserId.value ? Number(filterUserId.value) : undefined
    })
  } catch {
    toast.add({ title: 'Erreur de chargement du journal', color: 'error' as any })
  } finally {
    loadingGlobal.value = false
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

onMounted(() => {
  loadBrowsers()
  loadGlobalLogs()
})
</script>

<template>
  <div class="space-y-6">

    <!-- Navigateurs -->
    <UPageCard
      title="Navigateurs"
      description="Liste de tous les navigateurs ayant accédé à l'application."
      variant="naked"
      orientation="horizontal"
      class="mb-0"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Actualiser" color="neutral" :loading="pending" icon="i-lucide-refresh-cw" @click="loadBrowsers" />
      </div>
    </UPageCard>

    <UPageCard
      variant="subtle"
      :ui="{ container: 'p-0 sm:p-0 gap-y-0', wrapper: 'items-stretch', header: 'p-4 mb-0 border-b border-default' }"
    >
      <template #header>
        <UInput v-model="searchBr" icon="i-lucide-search" placeholder="Rechercher par navigateur, email ou IKEY…" class="w-full" />
      </template>
      <UTable :data="filteredBrowsers" :columns="browserColumns" :loading="pending" />
    </UPageCard>

    <!-- Journal global -->
    <UPageCard
      title="Journal global"
      description="Filtrer les logs par navigateur ou utilisateur."
      variant="naked"
      orientation="horizontal"
      class="mb-0 mt-6"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Filtrer" :loading="loadingGlobal" icon="i-lucide-filter" @click="loadGlobalLogs" />
      </div>
    </UPageCard>

    <UPageCard
      variant="subtle"
      :ui="{ container: 'p-0 sm:p-0 gap-y-0', wrapper: 'items-stretch', header: 'p-4 mb-0 border-b border-default' }"
    >
      <template #header>
        <div class="flex flex-col sm:flex-row gap-3">
          <UInput
            v-model="filterBrowserId"
            icon="i-lucide-monitor"
            placeholder="IKEY du navigateur"
            class="flex-1"
          />
          <UInput
            v-model="filterUserId"
            icon="i-lucide-user"
            placeholder="ID utilisateur"
            class="w-full sm:w-40"
            @keyup.enter="loadGlobalLogs"
          />
        </div>
      </template>
      <UTable :data="globalLogs" :columns="logColumns" :loading="loadingGlobal" />
    </UPageCard>

  </div>

  <!-- Modal logs d'un navigateur -->
  <UModal v-model:open="logsOpen" :title="`Logs — ${selectedBr?.browser ?? ''}`" size="xl">
    <template #content>
      <div class="p-4">
        <div v-if="selectedBr" class="flex flex-wrap gap-2 mb-4 text-sm text-muted">
          <UBadge :label="selectedBr.ikey"      color="neutral" variant="outline" />
          <UBadge :label="selectedBr.userEmail"  color="neutral" variant="outline" />
          <UBadge :label="selectedBr.revoked ? 'Révoqué' : 'Actif'" :color="selectedBr.revoked ? 'error' : 'success'" variant="subtle" />
        </div>

        <div v-if="loadingLogs" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-2xl text-muted" />
        </div>

        <UTable v-else :data="browserLogs" :columns="logColumns" />

        <div class="flex justify-end mt-4">
          <UButton label="Fermer" color="neutral" variant="soft" @click="logsOpen = false" />
        </div>
      </div>
    </template>
  </UModal>
</template>
