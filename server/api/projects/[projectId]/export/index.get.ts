import { desc, eq } from 'drizzle-orm'

/** The last exports of the project (spec 7.24), newest first. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const rows = await useDb()
    .select({
      id: tables.exportLog.id,
      what: tables.exportLog.what,
      format: tables.exportLog.format,
      allFinal: tables.exportLog.allFinal,
      flowClean: tables.exportLog.flowClean,
      createdAt: tables.exportLog.createdAt,
    })
    .from(tables.exportLog)
    .where(eq(tables.exportLog.projectId, project.id))
    .orderBy(desc(tables.exportLog.createdAt))
    .limit(12)
  return { records: JSON.parse(JSON.stringify(rows)) as (Omit<(typeof rows)[number], 'createdAt'> & { createdAt: string })[] }
})
