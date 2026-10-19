import { and, eq } from 'drizzle-orm'

/** A revision with its content (to read or compare an older version). */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const scene = await requireScene(project.id, requireUuidParam(event, 'sceneId'))
  const [revision] = await useDb()
    .select()
    .from(tables.sceneRevisions)
    .where(and(eq(tables.sceneRevisions.id, requireUuidParam(event, 'revisionId')), eq(tables.sceneRevisions.sceneId, scene.id)))
    .limit(1)
  if (!revision) throw createError({ statusCode: 404, message: 'Revision not found' })
  return JSON.parse(JSON.stringify(revision))
})
