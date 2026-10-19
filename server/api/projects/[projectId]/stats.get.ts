import { and, asc, eq, gte, isNull, sum } from 'drizzle-orm'
import { z } from 'zod'
import type { WritingStats } from '../../../../shared/types/entities'

const querySchema = z.object({ days: z.coerce.number().int().min(7).max(730).optional() })

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

/**
 * The writing log of the project: words written and removed per day (account time zone),
 * today, the current streak of writing days and the average of the last 30 days.
 */
export default defineEventHandler(async (event): Promise<WritingStats> => {
  const { user, project } = await requireProject(event)
  const { days: span = 365 } = parseQuery(event, querySchema)
  const today = dayIn(user.timezone)
  const db = useDb()

  const days = await db
    .select({ day: tables.writingLog.day, added: tables.writingLog.added, removed: tables.writingLog.removed, total: tables.writingLog.total })
    .from(tables.writingLog)
    .where(and(eq(tables.writingLog.projectId, project.id), gte(tables.writingLog.day, shiftDay(today, -span))))
    .orderBy(asc(tables.writingLog.day))

  const [total] = await db
    .select({ words: sum(tables.scenes.wordCount) })
    .from(tables.scenes)
    .where(and(eq(tables.scenes.projectId, project.id), isNull(tables.scenes.deletedAt)))

  const byDay = new Map(days.map(d => [d.day, d]))
  // The streak may end yesterday: today is not over yet.
  let streak = 0
  let cursor = (byDay.get(today)?.added ?? 0) > 0 ? today : shiftDay(today, -1)
  while ((byDay.get(cursor)?.added ?? 0) > 0) {
    streak++
    cursor = shiftDay(cursor, -1)
  }
  const from30 = shiftDay(today, -29)
  const active30 = days.filter(d => d.day >= from30 && d.day <= today && d.added > 0)
  const average30 = active30.length ? Math.round(active30.reduce((n, d) => n + d.added, 0) / active30.length) : 0

  return {
    today,
    days,
    todayAdded: byDay.get(today)?.added ?? 0,
    todayRemoved: byDay.get(today)?.removed ?? 0,
    streak,
    totalWords: Number(total?.words ?? 0),
    average30,
  }
})
