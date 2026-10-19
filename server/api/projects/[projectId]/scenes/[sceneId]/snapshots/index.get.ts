import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({ revisionId: z.uuid().optional() })

/** The history (Cronologia) of a scene's revisions, newest first, without content. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const scene = await requireScene(project.id, requireUuidParam(event, 'sceneId'))
  const { revisionId } = parseQuery(event, querySchema)
  const s = tables.sceneSnapshots
  const rows = await useDb()
    .select({ id: s.id, revisionId: s.revisionId, wordCount: s.wordCount, reason: s.reason, createdAt: s.createdAt })
    .from(s)
    .where(and(eq(s.sceneId, scene.id), ...(revisionId ? [eq(s.revisionId, revisionId)] : [])))
    .orderBy(desc(s.createdAt))
    .limit(300)
  return JSON.parse(JSON.stringify(rows)) as { id: string, revisionId: string, wordCount: number, reason: string, createdAt: string }[]
})
