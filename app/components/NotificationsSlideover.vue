<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'

const { isNotificationsSlideoverOpen } = useDashboard()
const { history, unreadCount, loadHistory, markAllRead, EVENT_ICON } = useNotifications()

onMounted(() => loadHistory())

async function onOpen(open: boolean) {
  isNotificationsSlideoverOpen.value = open
  if (!open) await markAllRead()
}
</script>

<template>
  <USlideover
    :open="isNotificationsSlideoverOpen"
    @update:open="onOpen"
  >
    <template #title>
      <span class="flex items-center gap-2">
        Notifications
        <UBadge v-if="unreadCount > 0" :label="String(unreadCount)" color="error" variant="solid" size="sm" />
      </span>
    </template>

    <template #body>
      <p v-if="!history.length" class="text-sm text-muted text-center py-8">
        Aucune notification
      </p>

      <div
        v-for="notif in history"
        :key="notif.id"
        class="px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-start gap-3 relative -mx-3"
        :class="{ 'opacity-60': notif.read }"
      >
        <UChip color="error" :show="!notif.read" inset>
          <div class="w-9 h-9 rounded-full bg-elevated flex items-center justify-center shrink-0">
            <UIcon :name="EVENT_ICON[notif.type]" class="text-lg" />
          </div>
        </UChip>

        <div class="text-sm flex-1 min-w-0">
          <p class="flex items-center justify-between gap-2">
            <span class="text-highlighted font-medium truncate">{{ notif.title }}</span>
            <time
              :datetime="notif.date"
              class="text-muted text-xs shrink-0"
              v-text="formatTimeAgo(new Date(notif.date))"
            />
          </p>
          <p class="text-dimmed truncate">{{ notif.body }}</p>
        </div>
      </div>
    </template>
  </USlideover>
</template>
