import { and, count, desc, eq, isNull } from 'drizzle-orm'

/**
 * Moves a revision to the trash. A scene keeps at least one live revision; trashing the active one
 * makes the newest remaining revision active.
 */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const sceneId = requireUuidParam(event, 'sceneId')
  const revisionId = requireUuidParam(event, 'revisionId')

  return useDb().transaction(async (tx) => {
    const scene = await requireScene(project.id, sceneId, tx)
    const live = and(eq(tables.sceneRevisions.sceneId, scene.id), isNull(tables.sceneRevisions.deletedAt))
    const [{ n }] = (await tx.select({ n: count() }).from(tables.sceneRevisions).where(live)) as [{ n: number }]
    if (Number(n) <= 1) throw createError({ statusCode: 400, message: 'A scene keeps at least one revision' })

    const now = new Date()
    const trashed = await tx
      .update(tables.sceneRevisions)
      .set({ deletedAt: now })
      .where(and(eq(tables.sceneRevisions.id, revisionId), live))
      .returning({ id: tables.sceneRevisions.id })
    if (!trashed.length) throw createError({ statusCode: 404, message: 'Revision not found' })

    let updatedScene = scene
    if (scene.currentRevisionId === revisionId) {
      const [latest] = await tx.select().from(tables.sceneRevisions).where(live).orderBy(desc(tables.sceneRevisions.number)).limit(1)
      updatedScene = await activateRevision(scene, latest!, tx)
    }
    await touchProject(project.id, tx)
    return { id: revisionId, deletedAt: now.toISOString(), scene: JSON.parse(JSON.stringify(updatedScene)) }
  })
})
