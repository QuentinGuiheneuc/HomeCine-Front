<script setup lang="ts">
// import { setCookie } from '@/utils/cookies'

const colorMode = useColorMode()

const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})
// onMounted(() => {
//   setCookie('TOKEN', '')
// })

const title = 'HomeCine - Dashboard' 
const description = 'HomeCine est un projet de serveur de streaming audio personnel, conçu pour offrir une expérience d’écoute de haute qualité et personnalisée. Avec HomeCine, vous pouvez diffuser votre musique préférée depuis n’importe où, tout en bénéficiant d’une interface conviviale et de fonctionnalités avancées pour gérer votre bibliothèque musicale.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/dashboard-light.png',
  twitterImage: 'https://ui.nuxt.com/assets/templates/nuxt/dashboard-light.png',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage/>
    </NuxtLayout>
  </UApp>
</template>
