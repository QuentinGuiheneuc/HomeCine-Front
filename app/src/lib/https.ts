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

// Instance séparée pour le /refresh — baseURL vide pour que /refresh corresponde
// exactement au path du cookie REFRESH_TOKEN (path:/refresh posé par le serveur)
const authHttp = axios.create({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  withCredentials: true,
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
      setCookie(CookieName.BROWSER, browser, { 'max-age': 60 * 60 * 24 * 365, path: '/' })
    }
    if (!cfg.headers) cfg.headers = new AxiosHeaders()
    cfg.headers.set('X-Browser', browser)
  }
  return cfg
})

// ── Response : refresh automatique sur token expiré/révoqué, puis retry ─────
http.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    const status   = error.response?.status
    const cfg       = error.config as (InternalAxiosRequestConfig & { skipAuthRedirect?: boolean; _retried?: boolean }) | undefined
    const url      = cfg?.url ?? ''
    const skip     = cfg?.skipAuthRedirect
    const isAuthEndpoint    = url.includes('/login') || url.includes('/logout')
    const isRefreshEndpoint = url.includes('/refresh')
    const isSpotifyEndpoint = url.includes('/spotify/')

    // Message d'erreur serveur (ex. "Token revoked", "jwt expired"…)
    const dataMsg = String(
      (error.response?.data as any)?.error ??
      (error.response?.data as any)?.message ?? ''
    ).toLowerCase()
    const looksTokenIssue =
      status === 401 ||
      (status === 403 && /token|revoked|revoqu|expir|jwt|unauthor/.test(dataMsg))

    // Token expiré/révoqué sur une route normale → tente UN refresh puis retry
    if (looksTokenIssue && !skip && !isAuthEndpoint && !isRefreshEndpoint && !isSpotifyEndpoint && cfg && !cfg._retried) {
      // Refresh déjà en cours → on met la requête en file d'attente
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((newToken: string) => {
            cfg._retried = true
            if (!cfg.headers) cfg.headers = new AxiosHeaders()
            ;(cfg.headers as any)['Authorization'] = `Bearer ${newToken}`
            resolve(http(cfg))
          })
        })
      }

      isRefreshing = true
      try {
        const { data } = await authHttp.post<{ access_token: string }>('/refresh')
        const newToken = data.access_token

        setCookie(CookieName.TOKEN, newToken)
        refreshQueue.forEach(cb => cb(newToken))
        refreshQueue = []

        cfg._retried = true
        if (!cfg.headers) cfg.headers = new AxiosHeaders()
        ;(cfg.headers as any)['Authorization'] = `Bearer ${newToken}`
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

    // Échec persistant après retry, ou 403 non lié au token → logout
    if (!skip && !isAuthEndpoint && !isSpotifyEndpoint && (status === 401 || (status === 403 && looksTokenIssue))) {
      deleteCookie(CookieName.TOKEN)
      redirectToLoginOnce()
    }

    return Promise.reject(error)
  }
)

export default http

/**
 * Refresh partagé (utilisable hors axios, ex. WebSocket sur Lecteur.AuthError).
 * Une seule requête /refresh à la fois : les appels concurrents attendent la même.
 * Pose le cookie TOKEN et renvoie le nouveau token, ou null si la session est morte.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null

  // Un refresh est déjà en cours (interceptor ou autre appelant) → on attend son résultat
  if (isRefreshing) {
    return new Promise<string | null>((resolve) => { refreshQueue.push((t: string) => resolve(t)) })
  }

  isRefreshing = true
  try {
    const { data } = await authHttp.post<{ access_token: string }>("/refresh")
    const newToken = data.access_token
    setCookie(CookieName.TOKEN, newToken)
    refreshQueue.forEach(cb => cb(newToken))
    refreshQueue = []
    return newToken
  } catch {
    refreshQueue = []
    return null
  } finally {
    isRefreshing = false
  }
}
