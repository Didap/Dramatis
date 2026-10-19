import { z } from 'zod'

const schema = z.object({
  kind: z.enum(['novel', 'game']),
  locale: z.enum(['it', 'en']).optional(),
})

/** Creates a copy of a demo project (a short novel or a game story) in the user's account. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { kind, locale } = await parseBody(event, schema)
  const project = await importDemo(user.id, kind, locale ?? (user.locale === 'en' ? 'en' : 'it'))
  return JSON.parse(JSON.stringify(project)) as typeof project
})
