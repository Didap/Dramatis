import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254).transform(email => email.trim().toLowerCase()),
  password: z.string().min(10).max(200),
  locale: z.enum(['it', 'en']).optional(),
  /** The browser's IANA time zone. */
  timezone: z.string().max(64).optional(),
})

export default defineEventHandler(async (event) => {
  rateLimit(`register:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`, 10, 60_000)
  const body = await parseBody(event, schema)
  const db = useDb()

  const [existing] = await db.select({ id: tables.users.id }).from(tables.users).where(eq(tables.users.email, body.email)).limit(1)
  if (existing) throw createError({ statusCode: 409, message: 'This email is already registered' })

  let user
  try {
    ;[user] = await db
      .insert(tables.users)
      .values({
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        locale: body.locale ?? 'it',
        timezone: isTimeZone(body.timezone) ? body.timezone! : 'Europe/Rome',
      })
      .returning()
  }
  catch (error) {
    if ((error as { code?: string }).code === '23505') throw createError({ statusCode: 409, message: 'This email is already registered' })
    throw error
  }

  await setUserSession(event, {
    user: { id: user!.id, email: user!.email, name: user!.name, locale: user!.locale, timezone: user!.timezone },
    loggedInAt: new Date().toISOString(),
  })
  return { user: toPublicUser(user!) }
})
