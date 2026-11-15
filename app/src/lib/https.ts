import axios, { AxiosHeaders } from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import appConfig from '@/src/config'
import { CookieName, getCookie, setCookie, deleteCookie } from '@/utils/cookies'
import { getBrowserToken } from '@/utils/browser'

let redirecting = false
/** Refresh en cours : toutes les requêtes et tous les appelants attendent le même */
let refreshing: Promise<string | null> | null = null

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
  baseURL: appConfig.API_URL,          // écrasé au démarrage par plugins/config.ts
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

    // Token expiré/révoqué sur une route normale → tente UN refresh puis retry.
    // Les requêtes qui échouent pendant ce temps attendent le même refresh.
    if (looksTokenIssue && !skip && !isAuthEndpoint && !isRefreshEndpoint && !isSpotifyEndpoint && cfg && !cfg._retried) {
      const newToken = await refreshAccessToken()
      if (!newToken) {
        // Refresh échoué → session morte, redirection login
        deleteCookie(CookieName.TOKEN)
        redirectToLoginOnce()
        return Promise.reject(error)
      }
      cfg._retried = true
      if (!cfg.headers) cfg.headers = new AxiosHeaders()
      ;(cfg.headers as any)['Authorization'] = `Bearer ${newToken}`
      return http(cfg)
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

/** Deballe l'enveloppe du back : reponse axios, corps { data }, ou valeur brute. */
export function unwrap<T>(res: unknown): T {
  const r = res as { data?: { data?: unknown } } | null | undefined
  return (r?.data?.data ?? r?.data ?? res) as T
}

/* GET identiques deja en cours : un seul aller-retour pour tous les appelants.
   Sur la page Musique, la sidebar et l'accueil demandent les memes listes au
   montage, et chaque page coute des appels Spotify cote serveur. */
const inflight = new Map<string, Promise<{ data: unknown }>>()
export async function getOnce(url: string, params?: Record<string, unknown>): Promise<{ data: unknown }> {
  const key = url + JSON.stringify(params ?? {})
  let p = inflight.get(key)
  if (!p) {
    p = http.get(url, { params }).finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  // copie par appelant : chacun modifie sa liste sans toucher celle des autres
  return { data: structuredClone((await p).data) }
}

/**
 * Refresh partagé (utilisable hors axios, ex. WebSocket sur Lecteur.AuthError).
 * Une seule requête /refresh à la fois : les appels concurrents attendent la même.
 * Pose le cookie TOKEN et renvoie le nouveau token, ou null si la session est morte.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  refreshing ??= authHttp.post<{ access_token: string }>('/refresh')
    .then(({ data }) => {
      setCookie(CookieName.TOKEN, data.access_token)
      return data.access_token
    })
    .catch(() => null)
    .finally(() => { refreshing = null })
  return refreshing
}
