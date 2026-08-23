import appConfig from '@/src/config'
import { CookieName, getCookie } from '@/utils/cookies'

/**
 * Construit l'URL d'un WebSocket (connexion directe sur WS_URL).
 *
 * Le cookie ne traversant pas vers l'hôte du WS (cross-origin), on joint le
 * token en query `?token=` pour permettre l'auth de la socket côté serveur
 * (ex. like). Le backend lit `token` à l'upgrade.
 *
 * `Device` est diffusé sur un port distinct (WS_URL_BROADCAST).
 */
export function wsProxyUrl(path: string): string {
  const p = path.replace(/^\//, '')
  const base = p === 'Device' ? appConfig.WS_URL_BROADCAST : appConfig.WS_URL
  const token = import.meta.client ? getCookie(CookieName.TOKEN) : ''
  const qs = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${base}/${p}${qs}`
}
