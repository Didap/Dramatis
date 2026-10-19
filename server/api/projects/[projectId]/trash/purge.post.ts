import { and, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { TRASHABLE_COLLECTIONS } from '#shared/utils/constants'

const schema = z.object({ collection: z.enum([...TRASHABLE_COLLECTIONS, 'revisions']), id: z.uuid() })

/** Deletes one item of the trash for good ("Elimina definitivamente"), with its batch. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const { collection, id } = await parseBody(event, schema)
  const table = collection === 'revisions' ? tables.sceneRevisions : tableOf(collection)
  const [inTrash] = await useDb()
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.projectId, project.id), isNotNull(table.deletedAt)))
    .limit(1)
  if (!inTrash) throw createError({ statusCode: 404, message: 'Not in the trash' })
  await useDb().transaction(async (tx) => {
    if (collection === 'revisions') await tx.delete(tables.sceneRevisions).where(eq(tables.sceneRevisions.id, id))
    else await purgeItem(project.id, collection, id, tx)
  })
  return { ok: true }
})
