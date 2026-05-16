import axios, { AxiosHeaders } from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import appConfig from '@/src/config'
import { CookieName, getCookie, setCookie, deleteCookie } from '@/utils/cookies'
import { getBrowserToken } from '@/utils/browser'

let redirecting = false
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

function redirectToLoginOnce() {
  if (typeof window === 'undefined' || redirecting) return
  if (window.location.pathname === '/login') return
  redirecting = true
  window.location.assign('/login')
}

// Instance séparée pour le /refresh — sans interceptors pour éviter la boucle infinie
const authHttp = axios.create({
  baseURL: appConfig.API_URL,
  withCredentials: true,           // envoie REFRESH_TOKEN (httpOnly) automatiquement
  headers: { 'Content-Type': 'application/json' }
})

const http = axios.create({
  baseURL: appConfig.API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

// ── Request : pose le Bearer depuis le cookie TOKEN (non-httpOnly, 15 min) ──
http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  if (typeof document !== 'undefined') {
    const token = getCookie(CookieName.TOKEN)
    if (token) {
      if (!cfg.headers) cfg.headers = new AxiosHeaders()
      cfg.headers.set('Authorization', `Bearer ${token}`)
    }

    // Persistance + envoi du navigateur détecté
    let browser = getCookie(CookieName.BROWSER)
    if (!browser) {
      browser = getBrowserToken()
      setCookie(CookieName.BROWSER, browser, { 'max-age': 60 * 60 * 24 * 365 })
    }
    if (!cfg.headers) cfg.headers = new AxiosHeaders()
    cfg.headers.set('X-Browser', browser)
  }
  return cfg
})

// ── Response : refresh automatique sur 401, puis retry ──────────────────────
http.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    const status   = error.response?.status
    const url      = error.config?.url ?? ''
    const skip     = (error.config as any)?.skipAuthRedirect
    const isAuthEndpoint    = url.includes('/login') || url.includes('/logout')
    const isRefreshEndpoint = url.includes('/refresh')
    const isSpotifyEndpoint = url.includes('/spotify/')

    // Erreur 401 sur une route normale → tente le refresh
    if (status === 401 && !skip && !isAuthEndpoint && !isRefreshEndpoint && !isSpotifyEndpoint) {
      // Si un refresh est déjà en cours, on met la requête en file d'attente
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((newToken: string) => {
            const cfg = error.config!
            if (!cfg.headers) cfg.headers = {} as any
            cfg.headers['Authorization'] = `Bearer ${newToken}`
            resolve(http(cfg))
          })
        })
      }

      isRefreshing = true
      try {
        const { data } = await authHttp.post<{ access_token: string }>('/refresh')
        const newToken = data.access_token

        // Persiste le nouveau token dans le cookie TOKEN
        setCookie(CookieName.TOKEN, newToken)

        // Vider la file d'attente avec le nouveau token
        refreshQueue.forEach(cb => cb(newToken))
        refreshQueue = []

        // Rejouer la requête originale
        const cfg = error.config!
        if (!cfg.headers) cfg.headers = {} as any
        cfg.headers['Authorization'] = `Bearer ${newToken}`
        return http(cfg)
      } catch {
        // Refresh échoué → session morte, redirection login
        refreshQueue = []
        deleteCookie(CookieName.TOKEN)
        redirectToLoginOnce()
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    // Autres 401/403 (Spotify, endpoints auth, etc.)
    if (!skip && !isAuthEndpoint && !isSpotifyEndpoint && (status === 401 || status === 403)) {
      deleteCookie(CookieName.TOKEN)
      redirectToLoginOnce()
    }

    return Promise.reject(error)
  }
)

export default http