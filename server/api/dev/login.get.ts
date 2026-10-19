import { eq } from 'drizzle-orm'

/**
 * Development only: signs in as the demo account and opens its last project (or ?to=).
 * Does not exist in production builds.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, message: 'Not found' })
  const [user] = await useDb().select().from(tables.users).where(eq(tables.users.email, 'demo@dramatis.local')).limit(1)
  if (!user) throw createError({ statusCode: 404, message: 'Run node scripts/dev-seed.mjs first' })
  await setUserSession(event, {
    user: { id: user.id, email: user.email, name: user.name, locale: user.locale, timezone: user.timezone },
    loggedInAt: new Date().toISOString(),
  })
  const query = getQuery(event)
  const to = typeof query.to === 'string' && query.to.startsWith('/') ? query.to : user.preferences.lastProjectId ? `/p/${user.preferences.lastProjectId}` : '/projects'
  return sendRedirect(event, to)
})
