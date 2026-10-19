import { and, asc, eq, isNull } from 'drizzle-orm'

/** The live revisions of a scene, in creation order, without content. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const scene = await requireScene(project.id, requireUuidParam(event, 'sceneId'))
  await currentRevision(scene)
  const rows = await useDb()
    .select()
    .from(tables.sceneRevisions)
    .where(and(eq(tables.sceneRevisions.sceneId, scene.id), isNull(tables.sceneRevisions.deletedAt)))
    .orderBy(asc(tables.sceneRevisions.number))
  return rows.map(toRevisionInfo)
})
