import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  label: zText(120).optional(),
  /** true makes this revision the active one. */
  current: z.literal(true).optional(),
})

/** Renames a revision, or makes it the active one ("Usa questa revisione"). */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const body = await parseBody(event, schema)
  const sceneId = requireUuidParam(event, 'sceneId')
  const revisionId = requireUuidParam(event, 'revisionId')

  return useDb().transaction(async (tx) => {
    const scene = await requireScene(project.id, sceneId, tx)
    const [revision] = await tx
      .select()
      .from(tables.sceneRevisions)
      .where(and(eq(tables.sceneRevisions.id, revisionId), eq(tables.sceneRevisions.sceneId, scene.id), isNull(tables.sceneRevisions.deletedAt)))
      .limit(1)
    if (!revision) throw createError({ statusCode: 404, message: 'Revision not found' })

    let updatedRevision = revision
    if (body.label !== undefined) {
      ;[updatedRevision] = await tx.update(tables.sceneRevisions).set({ label: body.label }).where(eq(tables.sceneRevisions.id, revision.id)).returning() as [typeof revision]
    }
    const updatedScene = body.current ? await activateRevision(scene, updatedRevision, tx) : scene
    await touchProject(project.id, tx)
    return { revision: toRevisionInfo(updatedRevision), scene: JSON.parse(JSON.stringify(updatedScene)) }
  })
})
