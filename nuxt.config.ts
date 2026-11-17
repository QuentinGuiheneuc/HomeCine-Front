// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  css: [
    '~/assets/css/main.css',
    '~/assets/css/sliders-many-colors.css'
  ],

  runtimeConfig: {
    // Variables uniquement serveur
    hostServ: process.env.HOST_SERV || '192.168.1.19',
    portServ: Number(process.env.PORT_SERV || 3007),
    port: Number(process.env.PORT || 3007),

    public: {
      // URL HTTP utilisée par le client
      apiUrl: process.env.API_URL || '/proxy',

      // WebSocket principal
      wsBase: `ws://${process.env.HOST_SERV || '192.168.1.19'}:${process.env.PORT_WS || 8099}`,

      // WebSocket broadcast
      wsUrlBroadcast: `ws://${process.env.HOST_SERV || '192.168.1.19'}:${process.env.PORT_WS_BROADCAST || 9086}`
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2024-07-11',

  // Le relais vers le back-end (/proxy/** et /refresh) est dans
  // server/middleware/backend.ts : il lit HOST_SERV / PORT_SERV à l'exécution.

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
