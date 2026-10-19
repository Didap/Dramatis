import { and, eq } from 'drizzle-orm'

/** One snapshot with its content, to read it or compare it. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const scene = await requireScene(project.id, requireUuidParam(event, 'sceneId'))
  const [row] = await useDb()
    .select()
    .from(tables.sceneSnapshots)
    .where(and(eq(tables.sceneSnapshots.id, requireUuidParam(event, 'snapshotId')), eq(tables.sceneSnapshots.sceneId, scene.id)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Snapshot not found' })
  return JSON.parse(JSON.stringify(row))
})
