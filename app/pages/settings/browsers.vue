<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatTimeAgo } from '@vueuse/core'

definePageMeta({ middleware: 'admin' })
import {
  getBrowsers, getBrowserLogs, getGlobalLogs,
  revokeBrowser, restoreBrowser,
  deleteLogs, deleteBrowserLogs
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

const filteredBrowsers = computed(() => {
  const q = searchBr.value.toLowerCase()
  if (!q) return browsers.value
  return browsers.value.filter(b =>
    b.browser_id.toLowerCase().includes(q) ||
    (b.browser_label ?? '').toLowerCase().includes(q) ||
    (b.user_email ?? '').toLowerCase().includes(q)
  )
})

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
  {
    accessorKey: 'browser_id',
    header: 'Browser ID',
    cell: ({ row }: any) => h('span', { class: 'font-mono text-xs' }, row.original.browser_id)
  },
  {
    accessorKey: 'browser_label',
    header: 'Navigateur',
    cell: ({ row }: any) => row.original.browser_label
      ? h(UBadge, { label: row.original.browser_label, color: 'neutral', variant: 'subtle' })
      : h('span', { class: 'text-muted text-xs' }, '—')
  },
  {
    accessorKey: 'user_email',
    header: 'Dernier utilisateur',
    cell: ({ row }: any) => row.original.user_email ?? '—'
  },
  {
    accessorKey: 'first_seen',
    header: 'Premier accès',
    cell: ({ row }: any) => formatTimeAgo(new Date(row.original.first_seen * 1000))
  },
  {
    accessorKey: 'last_seen',
    header: 'Dernière activité',
    cell: ({ row }: any) => formatTimeAgo(new Date(row.original.last_seen * 1000))
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
    accessorKey: 'created_at',
    header: 'Date',
    cell: ({ row }: any) => formatTimeAgo(new Date(row.original.created_at * 1000))
  },
  {
    accessorKey: 'method',
    header: 'Méthode',
    cell: ({ row }: any) => h(UBadge, {
      label:   row.original.method,
      color:   row.original.method === 'GET' ? 'info' : row.original.method === 'DELETE' ? 'error' : 'neutral',
      variant: 'subtle'
    })
  },
  { accessorKey: 'path',       header: 'Route' },
  { accessorKey: 'ip',         header: 'IP' },
  {
    accessorKey: 'user_email',
    header: 'Utilisateur',
    cell: ({ row }: any) => row.original.user_email ?? '—'
  },
  {
    accessorKey: 'ikey',
    header: 'IKEY',
    cell: ({ row }: any) => row.original.ikey
      ? h('span', { class: 'font-mono text-xs text-muted' }, row.original.ikey.slice(0, 8) + '…')
      : '—'
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const s = row.original.status
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
const filterBefore    = ref('')   // datetime-local string
const loadingGlobal   = ref(false)

async function loadGlobalLogs() {
  loadingGlobal.value = true
  try {
    globalLogs.value = await getGlobalLogs({
      browser_id: filterBrowserId.value || undefined,
      user_id:    filterUserId.value ? Number(filterUserId.value) : undefined
    })
  } catch {
    toast.add({ title: 'Erreur de chargement du journal', color: 'error' as any })
  } finally {
    loadingGlobal.value = false
  }
}

// ── Suppression logs ──────────────────────────────────────────────────────────

const confirmOpen  = ref(false)
const confirmMsg   = ref('')
const confirmAction = ref<() => Promise<void>>(() => Promise.resolve())
const deleting     = ref(false)

function askConfirm(msg: string, action: () => Promise<void>) {
  confirmMsg.value    = msg
  confirmAction.value = action
  confirmOpen.value   = true
}

async function runConfirmed() {
  deleting.value = true
  try {
    await confirmAction.value()
    toast.add({ title: 'Suppression effectuée', color: 'success' as any })
    confirmOpen.value = false
    await loadGlobalLogs()
  } catch {
    toast.add({ title: 'Erreur lors de la suppression', color: 'error' as any })
  } finally {
    deleting.value = false
  }
}

function deleteFiltered() {
  const filters: Record<string, any> = {}
  if (filterBrowserId.value) filters.browser_id = filterBrowserId.value
  if (filterUserId.value)    filters.user_id    = Number(filterUserId.value)
  if (filterBefore.value)    filters.before     = Math.floor(new Date(filterBefore.value).getTime() / 1000)

  const parts = []
  if (filters.browser_id) parts.push(`navigateur ${filters.browser_id}`)
  if (filters.user_id)    parts.push(`utilisateur #${filters.user_id}`)
  if (filters.before)     parts.push(`avant ${new Date(filterBefore.value).toLocaleString()}`)
  const scope = parts.length ? parts.join(', ') : 'TOUS les logs'

  askConfirm(`Supprimer ${scope} ?`, () => deleteLogs(filters))
}

async function deleteBrowserLogsModal() {
  if (!selectedBr.value) return
  askConfirm(
    `Supprimer tous les logs de "${selectedBr.value.browser_label ?? selectedBr.value.browser_id}" ?`,
    async () => {
      await deleteBrowserLogs(selectedBr.value!.id)
      browserLogs.value = []
    }
  )
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
      class="mb-0 pb-4"
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
      description="Filtrer et supprimer les logs par navigateur, utilisateur ou date."
      variant="naked"
      orientation="horizontal"
      class="mb-0 mt-6 pb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton label="Filtrer" :loading="loadingGlobal" icon="i-lucide-filter" @click="loadGlobalLogs" />
        <UButton
          label="Supprimer"
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
          @click="deleteFiltered"
        />
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
            placeholder="Browser ID"
            class="flex-1"
          />
          <UInput
            v-model="filterUserId"
            icon="i-lucide-user"
            placeholder="ID utilisateur"
            class="w-full sm:w-36"
          />
          <UInput
            v-model="filterBefore"
            type="datetime-local"
            icon="i-lucide-calendar"
            class="w-full sm:w-56"
            @keyup.enter="loadGlobalLogs"
          />
        </div>
      </template>
      <UTable :data="globalLogs" :columns="logColumns" :loading="loadingGlobal" />
    </UPageCard>

  </div>

  <!-- Modal logs d'un navigateur -->
  <UModal v-model:open="logsOpen" :title="`Logs — ${selectedBr?.browser_label ?? selectedBr?.browser_id ?? ''}`" size="xl">
    <template #content>
      <div class="p-4">
        <div v-if="selectedBr" class="flex flex-wrap gap-2 mb-4 text-sm text-muted">
          <UBadge :label="selectedBr.browser_id"    color="neutral" variant="outline" />
          <UBadge v-if="selectedBr.user_email" :label="selectedBr.user_email" color="neutral" variant="outline" />
          <UBadge :label="selectedBr.revoked ? 'Révoqué' : 'Actif'" :color="selectedBr.revoked ? 'error' : 'success'" variant="subtle" />
        </div>

        <div v-if="loadingLogs" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-2xl text-muted" />
        </div>

        <UTable v-else :data="browserLogs" :columns="logColumns" />

        <div class="flex justify-between mt-4">
          <UButton
            label="Vider les logs"
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            @click="deleteBrowserLogsModal"
          />
          <UButton label="Fermer" color="neutral" variant="soft" @click="logsOpen = false" />
        </div>
      </div>
    </template>
  </UModal>

  <!-- Confirmation suppression -->
  <UModal v-model:open="confirmOpen" title="Confirmer la suppression">
    <template #content>
      <div class="p-6 space-y-4">
        <UAlert
          icon="i-lucide-triangle-alert"
          color="error"
          variant="subtle"
          title="Action irréversible"
          :description="confirmMsg"
        />
        <div class="flex justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="soft" @click="confirmOpen = false" />
          <UButton label="Supprimer" color="error" :loading="deleting" icon="i-lucide-trash-2" @click="runConfirmed" />
        </div>
      </div>
    </template>
  </UModal>
</template>
