import { createSharedComposable } from '@vueuse/core'

const _useDashboard = () => {
  const route = useRoute()
  const router = useRouter()
  const isNotificationsSlideoverOpen = ref(false)
  const isDeviceSlideoverOpen = ref(false)

  defineShortcuts({
    'g-h': () => router.push('/'),
    'g-i': () => router.push('/inbox'),
    'g-c': () => router.push('/customers'),
    'g-s': () => router.push('/settings'),
    'n': () => isNotificationsSlideoverOpen.value = !isNotificationsSlideoverOpen.value,
    'd': () => isDeviceSlideoverOpen.value = !isDeviceSlideoverOpen.value
  })

  watch(() => route.fullPath, () => {
    isNotificationsSlideoverOpen.value = false
  })
  watch(() => route.fullPath, () => {
    isDeviceSlideoverOpen.value = false
  })
  return {
    isNotificationsSlideoverOpen,
    isDeviceSlideoverOpen
  }
}

export const useDashboard = createSharedComposable(_useDashboard)
