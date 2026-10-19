import { desc, eq, sql } from 'drizzle-orm'
import type { ProjectSummary } from '../../../shared/types/entities'

export default defineEventHandler(async (event): Promise<ProjectSummary[]> => {
  const user = await requireUser(event)
  const p = tables.projects
  const rows = await useDb()
    .select({
      id: p.id,
      kind: p.kind,
      title: p.title,
      subtitle: p.subtitle,
      genre: p.genre,
      color: p.color,
      wordGoal: p.wordGoal,
      deadline: p.deadline,
      openedAt: p.openedAt,
      deletedAt: p.deletedAt,
      settings: p.settings,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      // Explicitly qualified: an unqualified "id" inside the subquery would bind to the subquery's table.
      words: sql<number>`coalesce((select sum(s.word_count) from scenes s where s.project_id = projects.id and s.deleted_at is null), 0)::int`,
      scenes: sql<number>`(select count(*) from scenes s where s.project_id = projects.id and s.deleted_at is null)::int`,
      chapters: sql<number>`(select count(*) from chapters c where c.project_id = projects.id and c.deleted_at is null)::int`,
      characters: sql<number>`(select count(*) from characters c where c.project_id = projects.id and c.deleted_at is null)::int`,
    })
    .from(p)
    .where(eq(p.ownerId, user.id))
    .orderBy(desc(p.updatedAt))
  return JSON.parse(JSON.stringify(rows))
})
