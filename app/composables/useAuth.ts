import http from '../src/lib/https'

export type LoginBody = { email: string; password: string }

export function useAuth() {
  const token = useCookie<string | null>('TOKEN', { sameSite: 'lax', path: '/' })
  const isAuthenticated = computed(() => Boolean(token.value))

  async function login(body: LoginBody) {
    const res = await http<{ access_token: string }>('/login', {
      method: 'POST',
      data: body,
      withCredentials: true
    })
    token.value = res.data.access_token
    await navigateTo('/')
  }

  async function logout() {
    try {
      await http('/logout', { method: 'POST' })
    } catch {}
    token.value = null
    await navigateTo('/login')
  }

  return { token, isAuthenticated, login, logout }
}
