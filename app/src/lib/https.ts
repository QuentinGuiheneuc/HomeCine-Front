import axios, { AxiosHeaders } from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import appConfig from '@/src/config'
import { CookieName, getCookie, deleteCookie } from '@/utils/cookies'

let redirecting = false

function isOnLoginPage() {
  return typeof window !== 'undefined' && window.location.pathname === '/login'
}

function redirectToLoginOnce() {
  if (typeof window === 'undefined') return
  if (redirecting) return
  if (isOnLoginPage()) return

  redirecting = true
  window.location.assign('/login')
}

const http = axios.create({
  baseURL: appConfig.API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

http.interceptors.request.use((cfg: InternalAxiosRequestConfig & { skipAuthRedirect?: boolean }) => {
  // ✅ option: ne pas rediriger sur certaines requêtes (login/logout, etc.)
  ;(cfg as any).skipAuthRedirect = (cfg as any).skipAuthRedirect ?? false

  if (typeof document !== 'undefined') {
    const token = getCookie(CookieName.TOKEN)
    if (token) {
      if (!cfg.headers) cfg.headers = new AxiosHeaders()
      ;(cfg.headers as AxiosHeaders).set('Authorization', `Bearer ${token}`)
    }
  }
  return cfg
})

http.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    const status = error.response?.status
    const url = error.config?.url ?? ''
    const skip = (error.config as any)?.skipAuthRedirect

    // ⚠️ évite la boucle sur la page/login et sur l'appel /login lui-même
    const isAuthEndpoint = url.includes('/login') || url.includes('/logout')

    if (!skip && !isAuthEndpoint && (status === 401 || status === 403 || status === 402)) {
      if (typeof document !== 'undefined') deleteCookie(CookieName.TOKEN)
      redirectToLoginOnce()
    }

    return Promise.reject(error)
  }
)

export default http
