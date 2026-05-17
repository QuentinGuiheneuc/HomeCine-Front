import { createSharedComposable } from '@vueuse/core'

export interface CurrentUser {
  id: number
  email: string
  type?: string
  admin?: number
  name?: string
}

function decodeJwt(token: string): any {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

const _useCurrentUser = () => {
  const token = useCookie<string | null>('TOKEN')

  const user = computed<CurrentUser | null>(() => {
    if (!token.value) return null
    const payload = decodeJwt(token.value)
    return payload?.users ?? null
  })

  const isAdmin = computed(() => {
    if (!user.value) return false
    return user.value.type === 'admin' || user.value.admin === 1
  })

  return { user, isAdmin, token }
}

export const useCurrentUser = createSharedComposable(_useCurrentUser)
