import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  email: z.email().max(254).transform(email => email.trim().toLowerCase()),
  password: z.string().min(1).max(200),
})

// Verified against when the email is unknown, so both paths take the same time.
let dummyHash: string | null = null

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, schema)
  rateLimit(`login:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}:${body.email}`, import.meta.dev ? 1000 : 8, 60_000)

  const [user] = await useDb().select().from(tables.users).where(eq(tables.users.email, body.email)).limit(1)
  if (!user) {
    dummyHash ??= await hashPassword('dramatis-timing-equaliser')
    await verifyPassword(dummyHash, body.password)
    throw createError({ statusCode: 401, message: 'Wrong email or password' })
  }
  if (!(await verifyPassword(user.passwordHash, body.password))) {
    throw createError({ statusCode: 401, message: 'Wrong email or password' })
  }

  await setUserSession(event, {
    user: { id: user.id, email: user.email, name: user.name, locale: user.locale, timezone: user.timezone },
    loggedInAt: new Date().toISOString(),
  })
  return { user: toPublicUser(user) }
})
