export default defineNuxtRouteMiddleware((to) => {
  const token = useCookie<string | null>(CookieName.TOKEN)
  if (!token.value && to.path !== '/login') {
    return navigateTo('/login')
  }
})
