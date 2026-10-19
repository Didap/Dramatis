import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({ size: z.enum(['thumb', 'full']).optional() })

/** Serves an image of the signed-in user; ?size=thumb serves the thumbnail when there is one. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = requireUuidParam(event, 'id')
  const { size } = parseQuery(event, querySchema)
  const [row] = await useDb()
    .select({ mime: tables.media.mime, data: tables.media.data, thumb: tables.media.thumb })
    .from(tables.media)
    .where(and(eq(tables.media.id, id), eq(tables.media.ownerId, user.id)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Not found' })
  setResponseHeaders(event, {
    'content-type': row.mime,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  })
  return size === 'thumb' && row.thumb ? row.thumb : row.data
})
