// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],
  css: ['~/assets/css/main.css', '~/assets/css/sliders-many-colors.css'],

  runtimeConfig: {
    public: {
      wsBase: process.env.WS_BASE ?? 'ws://localhost:8099'
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
      'process.env.API_URL': JSON.stringify(process.env.API_URL ?? 'http://localhost:3007'),
      'process.env.WS_BASE': JSON.stringify(process.env.WS_BASE ?? 'ws://localhost:8099')
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
