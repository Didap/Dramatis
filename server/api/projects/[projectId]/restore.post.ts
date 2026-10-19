import { eq } from 'drizzle-orm'

/** Brings a project back from the trash. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event, undefined, { includeDeleted: true })
  if (!project.deletedAt) return { ok: true }
  await useDb().update(tables.projects).set({ deletedAt: null, updatedAt: project.updatedAt }).where(eq(tables.projects.id, project.id))
  return { ok: true }
})
