import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

// Every collection with a position (relationships have none).
const ORDERABLE = ['characters', 'groups', 'locations', 'objects', 'images', 'strands', 'parts', 'chapters', 'scenes', 'links', 'variables', 'maps', 'events', 'notes', 'codexCategories', 'codexEntries'] as const

const schema = z.object({
  collection: z.enum(ORDERABLE),
  /** The complete new order of the siblings. */
  ids: z.array(z.uuid()).min(1).max(5000),
  /** chapters: the part they now belong to (null = no part). */
  partId: z.uuid().nullable().optional(),
  /** scenes: the chapter they now belong to. */
  chapterId: z.uuid().optional(),
})

/** Sets the order of siblings, and moves them into a part or chapter when one is given. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const body = await parseBody(event, schema)
  const ids = [...new Set(body.ids)]

  const checks: RefCheck[] = [{ collection: body.collection, ids }]
  if (body.collection === 'chapters' && body.partId) checks.push({ collection: 'parts', ids: [body.partId] })
  if (body.collection === 'scenes' && body.chapterId) checks.push({ collection: 'chapters', ids: [body.chapterId] })
  await assertRefs(project.id, checks)

  const table = tableOf(body.collection)
  await useDb().transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      // Reordering is not editing: "last edited" stays as it was.
      const set: Record<string, unknown> = { position: index, ...('updatedAt' in table ? { updatedAt: sql`${table.updatedAt}` } : {}) }
      if (body.collection === 'chapters' && body.partId !== undefined) set.partId = body.partId
      if (body.collection === 'scenes' && body.chapterId) set.chapterId = body.chapterId
      await tx.update(table).set(set).where(and(eq(table.id, id), eq(table.projectId, project.id)))
    }
    await touchProject(project.id, tx)
  })
  return { ok: true }
})
