const PRIVATE = [/^\/projects(\/|$)/, /^\/p\//, /^\/account$/, /^\/print\//]
const GUEST_ONLY = ['/login', '/signup']

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value && PRIVATE.some(re => re.test(to.path))) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (loggedIn.value && GUEST_ONLY.includes(to.path)) {
    return navigateTo('/projects')
  }
})
