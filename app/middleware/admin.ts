const ADMIN_ROUTES = [
  '/settings/members',
  '/settings/browsers',
  '/settings/spotify',
]

export default defineNuxtRouteMiddleware((to) => {
  const { isAdmin } = useCurrentUser()

  const isAdminRoute = ADMIN_ROUTES.some(r => to.path.startsWith(r))
  if (isAdminRoute && !isAdmin.value) {
    return navigateTo('/settings')
  }
})
