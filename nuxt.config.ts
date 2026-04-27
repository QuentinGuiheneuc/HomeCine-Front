// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css', '~/assets/css/sliders-many-colors.css'],

  runtimeConfig: {
    public: {
      wsBase: process.env.WS_BASE ?? 'ws://192.168.1.40:8099'
    }
  },

  // Expose les variables d'environnement au bundle client (baked au build)
  vite: {
    define: {
      'process.env.API_URL': JSON.stringify(process.env.API_URL ?? 'http://192.168.1.40:3007'),
      'process.env.WS_BASE': JSON.stringify(process.env.WS_BASE ?? 'ws://192.168.1.40:8099')
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
