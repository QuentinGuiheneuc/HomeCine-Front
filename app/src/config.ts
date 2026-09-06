export const useAppConfig = () => {
  const config = useRuntimeConfig()

  return {
    API_URL: config.public.apiUrl,
    WS_URL: config.public.wsBase,
    WS_URL_BROADCAST: config.public.wsUrlBroadcast
  } as const
}

/**
 * Mêmes valeurs, lisibles hors contexte Nuxt : instance axios créée au
 * chargement du module, et reconnexions WebSocket (setTimeout / après await),
 * où useRuntimeConfig() n'est pas appelable.
 * Renseignée une fois au démarrage par plugins/config.ts.
 */
export const appConfig = {
  API_URL: '/proxy',
  WS_URL: 'ws://192.168.1.19:8099',
  WS_URL_BROADCAST: 'ws://192.168.1.19:9086'
}

export default appConfig
