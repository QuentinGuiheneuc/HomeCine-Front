import http from '../src/lib/https'

export type LoginBody = { email: string, password: string }

export function useAuth() {
  /* const config = useRuntimeConfig() as unknown as { public: { apiBase: string | undefined } } */
  const token = useCookie<string | null>('TOKEN', { sameSite: 'lax', path: '/' }) as Ref<string | null>
  if (token.value === undefined) {
    setCookie(CookieName.TOKEN, '')
  }
  function setToken() {
    if (CookieName.TOKEN === undefined) {
      setCookie(CookieName.TOKEN, '')
    }
  }
  // const authUi = useCookie<string | null>('AUTH_UI', { sameSite: 'lax', path: '/' })
  const isAuthenticated = computed(() => Boolean(token.value))
  async function login(body: LoginBody) {
    const res = await http<{ access_token: string }>(`/login`, {
      method: 'POST',
      data: body,
      withCredentials: true
    })
    token.value = res.data.access_token // ou récupère depuis Set-Cookie côté serveur
    await navigateTo('/')
  }
  async function logout() {
    try {
      await http('/logout', { method: 'POST' })
    } catch (_) { /* ignore */ }
    token.value = null
    await navigateTo('/login')
  }
  return { token, isAuthenticated, setToken, login, logout }
}
