import axios, { AxiosHeaders } from 'axios'
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
// import appConfig from '@/src/config' // { API_URL: string, LOGIN_URL?: string }
import { CookieName, getCookie, setCookie, deleteCookie } from '@/utils/cookies'

/**
* Optional hook if you want to run custom logic instead of the default redirect.
* Example: setOnUnauthorized(() => openLoginModal())
*/
let onUnauthorized: (() => void) | null = null
export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler
}

const http: AxiosInstance = axios.create({
  baseURL: 'http://192.168.1.19:3007/',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

function isOnLoginPage(loginUrl: string) {
  try {
    const target = new URL(loginUrl, window.location.origin)
    return (
      window.location.pathname === target.pathname && window.location.search === target.search
    )
  } catch {
  // If LOGIN_URL is relative like "/login" this is fine
    return window.location.pathname === loginUrl
  }
}

function redirectToLogin() {
  const loginUrl = '/login'
  if (!isOnLoginPage(loginUrl)) {
    // Hard navigation (no router required)
    window.location.assign(loginUrl)
  }
}
// Request: inject Bearer token from cookies
http.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = getCookie(CookieName.TOKEN)
  if (token) {
    if (!cfg.headers) cfg.headers = new AxiosHeaders()
    ;(cfg.headers as AxiosHeaders).set('Authorization', `Bearer ${token}`)
  }
  return cfg
},
(error: AxiosError) => Promise.reject(error)
)

export enum AuthUiCode {
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  FORBIDDEN = 'FORBIDDEN',
  CSRF_EXPIRED = 'CSRF_EXPIRED',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR'
}
export default http
