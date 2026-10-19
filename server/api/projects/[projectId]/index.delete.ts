import { eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({ forever: z.enum(['1', 'true']).optional() })

/**
 * Moves the project to the trash (restorable from the projects list). With ?forever=1, a project
 * already in the trash is deleted for good with everything in it; the UI asks for the title first.
 */
export default defineEventHandler(async (event) => {
  const { forever } = parseQuery(event, querySchema)
  const { project } = await requireProject(event, undefined, { includeDeleted: !!forever })
  const db = useDb()
  if (forever) {
    if (!project.deletedAt) throw createError({ statusCode: 409, message: 'Move the project to the trash first' })
    await db.delete(tables.projects).where(eq(tables.projects.id, project.id))
    return { ok: true, deleted: true }
  }
  await db.update(tables.projects).set({ deletedAt: new Date(), updatedAt: project.updatedAt }).where(eq(tables.projects.id, project.id))
  return { ok: true, trashed: true }
})
