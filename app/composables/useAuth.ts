import http from '../src/lib/https'

export type LoginBody = { email: string, password: string }

export function useAuth() {
  /* const config = useRuntimeConfig() as unknown as { public: { apiBase: string | undefined } } */
  const token = useCookie<string | null>('TOKEN', { sameSite: 'lax', path: '/' })
  const authUi = useCookie<string | null>('AUTH_UI', { sameSite: 'lax', path: '/' })
  const isAuthenticated = computed(() => Boolean(token.value))

  const uiMessage = computed(() => {
    const code = authUi.value
    // Nettoyage one-shot
    if (code) authUi.value = null
    if (code === 'SESSION_EXPIRED') return 'Votre session a expiré. Veuillez vous reconnecter.'
    if (code === 'FORBIDDEN') return 'Accès refusé.'
    if (code === 'CSRF_EXPIRED') return 'Session CSRF expirée. Réessayez.'
    if (code === 'RATE_LIMIT') return 'Trop de requêtes. Réessayez plus tard.'
    if (code === 'SERVER_ERROR') return 'Erreur serveur. Réessayez.'
    return null
  })

  async function login(body: LoginBody) {
    const res = await http<{ access_token: string }>(`/login`, {
      method: 'POST',
      data: body,
      baseURL: 'http://192.168.1.19:3007/',
      withCredentials: true
    })
    token.value = res.data.access_token // ou récupère depuis Set-Cookie côté serveur
    await navigateTo('/')
  }
  async function logout() {
    try {
      await http('/logout', { method: 'POST', baseURL: 'http://192.168.1.19:3007/', credentials: 'include' })
    } catch (_) { /* ignore */ }
    token.value = null
    await navigateTo('/login')
  }
  return { token, isAuthenticated, uiMessage, login, logout }
}
