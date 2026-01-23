<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import http from '@/src/lib/https'

const { logout } = useAuth()
defineProps<{ collapsed?: boolean }>()

const colorMode = useColorMode()
const appConfig = useAppConfig()

type SettingsDto = {
  ui?: { primary?: string, neutral?: string }
  appearance?: 'light' | 'dark'
}

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']

/** ✅ SAVE SETTINGS -> POST /settings */
let saveTimer: ReturnType<typeof setTimeout> | null = null
const saving = ref(false)

async function saveSettings() {
  try {
    saving.value = true
    await http.post('/settings', {
      ui: {
        primary: appConfig.ui.colors.primary,
        neutral: appConfig.ui.colors.neutral
      },
      appearance: colorMode.preference === 'dark' ? 'dark' : 'light'
    })
  } catch (e) {
    console.warn('POST /settings failed', e)
  } finally {
    saving.value = false
  }
}

function queueSaveSettings() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void saveSettings()
  }, 400)
}
/** --- le reste de ton code user/items --- */
const user = ref({
  name: '',
  avatar: { src: 'https://avatars.githubusercontent.com/u/0?v=4', alt: 'User' }
})

interface UserProfile { id: string, email: string, name: string, settings?: SettingsDto }

onMounted(() => {
  http.get<UserProfile>('/user')
    .then((r) => {
      const s = r.data.settings

      if (s?.ui?.primary) appConfig.ui.colors.primary = s.ui.primary
      if (s?.ui?.neutral) appConfig.ui.colors.neutral = s.ui.neutral
      if (s?.appearance) colorMode.preference = s.appearance

      user.value.name = r.data.name || user.value.name
    })
    .catch((e) => {
      console.debug('user fetch error', e)
    })
})

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: user.value.name,
  avatar: user.value.avatar
}], [{
  label: 'Profile',
  icon: 'i-lucide-user'
}, {
  label: 'Billing',
  icon: 'i-lucide-credit-card'
}, {
  label: 'Settingsss',
  icon: 'i-lucide-settings',
  to: '/settings'
}], [{
  label: 'Theme',
  icon: 'i-lucide-palette',
  children: [{
    label: 'Primary',
    slot: 'chip',
    chip: appConfig.ui.colors.primary,
    content: { align: 'center', collisionPadding: 16 },
    children: colors.map(color => ({
      label: color,
      chip: color,
      slot: 'chip',
      checked: appConfig.ui.colors.primary === color,
      type: 'checkbox',
      onSelect: (e: Event) => {
        e.preventDefault()
        appConfig.ui.colors.primary = color
        queueSaveSettings() // ✅ save API
      }
    }))
  }, {
    label: 'Neutral',
    slot: 'chip',
    chip: appConfig.ui.colors.neutral === 'neutral' ? 'old-neutral' : appConfig.ui.colors.neutral,
    content: { align: 'end', collisionPadding: 16 },
    children: neutrals.map(color => ({
      label: color,
      chip: color === 'neutral' ? 'old-neutral' : color,
      slot: 'chip',
      type: 'checkbox',
      checked: appConfig.ui.colors.neutral === color,
      onSelect: (e: Event) => {
        e.preventDefault()
        appConfig.ui.colors.neutral = color
        queueSaveSettings() // ✅ save API
      }
    }))
  }]
}, {
  label: 'Appearance',
  icon: 'i-lucide-sun-moon',
  children: [{
    label: 'Light',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.value === 'light',
    onSelect: (e: Event) => {
      e.preventDefault()
      colorMode.preference = 'light'
      queueSaveSettings() // ✅ save API
    }
  }, {
    label: 'Dark',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onSelect: (e: Event) => {
      e.preventDefault()
      colorMode.preference = 'dark'
      queueSaveSettings() // ✅ save API
    }
  }]
}], [{
  label: 'Log out',
  icon: 'i-lucide-log-out',
  onSelect: async (e) => {
    e?.preventDefault?.()
    await logout()
  }
}]]))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        ...user,
        label: collapsed ? undefined : user?.name,
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />

    <template #chip-leading="{ item }">
      <span
        :style="{
          '--chip-light': `var(--color-${(item as any).chip}-500)`,
          '--chip-dark': `var(--color-${(item as any).chip}-400)`
        }"
        class="ms-0.5 size-2 rounded-full bg-(--chip-light) dark:bg-(--chip-dark)"
      />
    </template>
  </UDropdownMenu>
</template>
