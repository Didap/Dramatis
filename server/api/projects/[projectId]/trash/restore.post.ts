import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { TRASHABLE_COLLECTIONS } from '#shared/utils/constants'

const schema = z.object({ collection: z.enum([...TRASHABLE_COLLECTIONS, 'revisions']), id: z.uuid() })

/** Brings an item back from the trash, with its batch, to its place (or to "Ripristinati"). */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const { collection, id } = await parseBody(event, schema)
  await useDb().transaction(async (tx) => {
    if (collection !== 'revisions') return restoreItem(project.id, collection, id, tx)
    const [revision] = await tx
      .select()
      .from(tables.sceneRevisions)
      .where(and(eq(tables.sceneRevisions.id, id), eq(tables.sceneRevisions.projectId, project.id), isNotNull(tables.sceneRevisions.deletedAt)))
      .limit(1)
    if (!revision) throw createError({ statusCode: 404, message: 'Not in the trash' })
    const [scene] = await tx.select({ id: tables.scenes.id }).from(tables.scenes).where(and(eq(tables.scenes.id, revision.sceneId), isNull(tables.scenes.deletedAt)))
    if (!scene) throw createError({ statusCode: 409, message: 'Restore the scene first' })
    await tx.update(tables.sceneRevisions).set({ deletedAt: null }).where(eq(tables.sceneRevisions.id, id))
  })
  await touchProject(project.id)
  return { ok: true }
})
