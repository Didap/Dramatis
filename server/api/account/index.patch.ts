import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    locale: z.enum(['it', 'en']),
    timezone: z.string().max(64).refine(isTimeZone, 'Unknown time zone'),
    preferences: z.object({
      editor: z
        .object({
          font: z.enum(['serif', 'sans']).optional(),
          size: z.number().int().min(14).max(24).optional(),
          lineHeight: z.number().min(1.4).max(2).optional(),
          width: z.enum(['narrow', 'medium', 'wide']).optional(),
          typewriter: z.boolean().optional(),
          focusParagraph: z.boolean().optional(),
          readingSize: z.number().int().min(13).max(22).optional(),
          readingWidth: z.enum(['book', 'wide', 'full']).optional(),
          readingJustify: z.boolean().optional(),
          spellcheck: z.boolean().optional(),
        })
        .optional(),
      guidance: z.boolean().optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
      lastProjectId: z.uuid().optional(),
    }),
  })
  .partial()

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const session = await requireUserSession(event)
  const patch = await parseBody(event, schema)
  const db = useDb()
  const [current] = await db.select().from(tables.users).where(eq(tables.users.id, session.user.id)).limit(1)
  if (!current) throw createError({ statusCode: 401, message: 'Signed out' })

  const preferences = patch.preferences
    ? { ...current.preferences, ...patch.preferences, editor: { ...current.preferences.editor, ...patch.preferences.editor } }
    : undefined
  const [user] = await db
    .update(tables.users)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.locale ? { locale: patch.locale } : {}),
      ...(patch.timezone ? { timezone: patch.timezone } : {}),
      ...(preferences ? { preferences } : {}),
    })
    .where(eq(tables.users.id, current.id))
    .returning()

  await setUserSession(event, {
    user: { id: user!.id, email: user!.email, name: user!.name, locale: user!.locale, timezone: user!.timezone },
    loggedInAt: session.loggedInAt,
  })
  return toPublicUser(user!)
})
