// https://nuxt.com/docs/api/configuration/nuxt-config
const ip = "192.168.1.19"
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],
  css: ['~/assets/css/main.css', '~/assets/css/sliders-many-colors.css'],

  runtimeConfig: {
    public: {
      wsBase: process.env.WS_BASE ?? `ws://${ip}:8099`
    }
  },
  
  nitro: {
    routeRules: {
      // /refresh à la racine — REFRESH_TOKEN a path:/refresh côté serveur,
      // la requête doit arriver sur /refresh pour que le cookie soit envoyé
      '/refresh':  { proxy: `http://${ip}:3007/refresh` },
      // Toutes les autres routes API (login, logout, user, etc.)
      '/proxy/**': { proxy: `http://${ip}:3007/**` }
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2024-07-11',

  // Expose les variables d'environnement au bundle client (baked au build)
  vite: {
    define: {
      'process.env.API_URL': JSON.stringify(process.env.API_URL ?? '/proxy'),
      'process.env.WS_BASE': JSON.stringify(process.env.WS_BASE ?? `ws://${ip}:8099`)
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
