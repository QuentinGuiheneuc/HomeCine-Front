export default defineNuxtRouteMiddleware((to) => {
  const token = useCookie<string | null>('TOKEN')
  if (!token.value && to.path !== '/login') {
    return navigateTo('/login')
  }
})
