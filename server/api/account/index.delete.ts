import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  /** The account's email, typed by the author to confirm. */
  email: z.string().trim().max(254),
})

/**
 * Deletes the signed-in account for good, with every project, image and writing log in it
 * (the foreign keys cascade). The author types the email first; the page offers the backups before.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const session = await requireUserSession(event)
  rateLimit(`account-delete:${session.user.id}`, 6, 60_000)
  const { email } = await parseBody(event, schema)
  const db = useDb()
  const [user] = await db.select({ id: tables.users.id, email: tables.users.email }).from(tables.users).where(eq(tables.users.id, session.user.id)).limit(1)
  if (!user) throw createError({ statusCode: 401, message: 'Signed out' })
  if (email.toLowerCase() !== user.email.toLowerCase()) {
    throw createError({ statusCode: 400, message: 'The email does not match' })
  }
  await db.delete(tables.users).where(eq(tables.users.id, user.id))
  await clearUserSession(event)
  return { ok: true, deleted: true }
})
