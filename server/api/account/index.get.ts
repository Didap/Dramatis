import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { id } = await requireUser(event)
  const [user] = await useDb().select().from(tables.users).where(eq(tables.users.id, id)).limit(1)
  if (!user) throw createError({ statusCode: 401, message: 'Signed out' })
  return toPublicUser(user)
})
