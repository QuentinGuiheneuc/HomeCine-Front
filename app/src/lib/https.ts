import axios, { AxiosHeaders } from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import appConfig from '@/src/config'
import { CookieName, getCookie, deleteCookie } from '@/utils/cookies'

let redirecting = false

function redirectToLoginOnce() {
  if (typeof window === 'undefined' || redirecting) return
  if (window.location.pathname === '/login') return
  redirecting = true
  window.location.assign('/login')
}

const http = axios.create({
  baseURL: appConfig.API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  if (typeof document !== 'undefined') {
    const token = getCookie(CookieName.TOKEN)
    if (token) {
      if (!cfg.headers) cfg.headers = new AxiosHeaders()
      cfg.headers.set('Authorization', `Bearer ${token}`)
    }
  }
  return cfg
})

http.interceptors.response.use(
  r => r,
  (error: AxiosError) => {
    const status = error.response?.status
    const url = error.config?.url ?? ''
    const skip = (error.config as any)?.skipAuthRedirect
    const isAuthEndpoint = url.includes('/login') || url.includes('/logout')
    // Les erreurs 401/403 des routes Spotify viennent de l'API Spotify (scope manquant,
    // token expiré côté Spotify…) — elles ne doivent pas déconnecter l'utilisateur de l'appli.
    const isSpotifyEndpoint = url.includes('/spotify/')

    if (!skip && !isAuthEndpoint && !isSpotifyEndpoint && (status === 401 || status === 402 || status === 403)) {
      if (typeof document !== 'undefined') deleteCookie(CookieName.TOKEN)
      redirectToLoginOnce()
    }

    return Promise.reject(error)
  }
)

export default http
