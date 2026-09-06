import { useAppConfig, appConfig } from '@/src/config'
import http from '@/src/lib/https'

/**
 * Recopie runtimeConfig dans `appConfig` au démarrage : un plugin est l'un des
 * rares endroits où useRuntimeConfig() est appelable. Les consommateurs hors
 * contexte Nuxt (axios, wsProxyUrl) lisent ensuite ce cache.
 */
export default defineNuxtPlugin(() => {
  Object.assign(appConfig, useAppConfig())
  http.defaults.baseURL = appConfig.API_URL
})
