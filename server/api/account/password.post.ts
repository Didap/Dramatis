import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { UserPreferences } from '#shared/types/domain'

const schema = z.object({
  current: z.string().min(1).max(200),
  password: z.string().min(10).max(200),
})

/**
 * Changes the password of the signed-in account; the current one must be given (403 when wrong).
 * Sessions are sealed cookies, valid on every device until they expire: the change is recorded in
 * the preferences (passwordChangedAt) and this device's session starts again from now, so a session
 * signed in before the change can be told apart and refused (that check belongs to requireUser).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const session = await requireUserSession(event)
  rateLimit(`password:${session.user.id}`, 6, 60_000)
  const body = await parseBody(event, schema)
  const db = useDb()
  const [user] = await db.select().from(tables.users).where(eq(tables.users.id, session.user.id)).limit(1)
  if (!user) throw createError({ statusCode: 401, message: 'Signed out' })
  if (!(await verifyPassword(user.passwordHash, body.current))) {
    throw createError({ statusCode: 403, message: 'Wrong password' })
  }
  const changedAt = new Date().toISOString()
  const preferences = { ...user.preferences, passwordChangedAt: changedAt } as UserPreferences
  await db.update(tables.users).set({ passwordHash: await hashPassword(body.password), preferences }).where(eq(tables.users.id, user.id))
  await replaceUserSession(event, {
    user: { id: user.id, email: user.email, name: user.name, locale: user.locale, timezone: user.timezone },
    loggedInAt: changedAt,
  })
  return { ok: true }
})
