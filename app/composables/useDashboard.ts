import { createSharedComposable } from '@vueuse/core'

const _useDashboard = () => {
  const route = useRoute()
  const router = useRouter()
  const isNotificationsSlideoverOpen = ref(false)
  const isDevicSpotifyeSlideoverOpen = ref(false)
  const isDeviceSlideoverOpen = ref(false)
  const activeDeviceKey = ref<string | null>(null)
  const menue = ref(false)
  const saving = ref(false)

  defineShortcuts({
    'g-h': () => router.push('/'),
    'g-i': () => router.push('/inbox'),
    'g-c': () => router.push('/customers'),
    'g-s': () => router.push('/settings'),
    'n': () => isNotificationsSlideoverOpen.value = !isNotificationsSlideoverOpen.value,
    's-d': () => isDevicSpotifyeSlideoverOpen.value = !isDevicSpotifyeSlideoverOpen.value,
    'd': () => isDeviceSlideoverOpen.value = !isDeviceSlideoverOpen.value,
    'm': () => menue.value = !menue.value
  })

  watch(() => route.fullPath, () => {
    isNotificationsSlideoverOpen.value = false
  })
  watch(() => route.fullPath, () => {
    isDevicSpotifyeSlideoverOpen.value = false
  })
  watch(() => route.fullPath, () => {
    isDeviceSlideoverOpen.value = false
  })
  watch(() => route.fullPath, () => {
    menue.value = false
  })
  return {
    isNotificationsSlideoverOpen,
    isDevicSpotifyeSlideoverOpen,
    isDeviceSlideoverOpen,
    menue,
    activeDeviceKey,
    saving
  }
}

export const useDashboard = createSharedComposable(_useDashboard)
