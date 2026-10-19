import { and, eq, isNotNull } from 'drizzle-orm'
import type { Collection } from '../../../../../shared/types/domain'

/** Empties the trash: containers first, so their contents go with them. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const order: Collection[] = ['parts', 'chapters', 'scenes', 'codexCategories', 'codexEntries', 'characters', 'groups', 'locations', 'objects', 'images', 'strands', 'links', 'variables', 'relations', 'maps', 'events', 'notes']
  let removed = 0
  await useDb().transaction(async (tx) => {
    for (const collection of order) {
      const table = tableOf(collection)
      const rows: { id: string }[] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.projectId, project.id), isNotNull(table.deletedAt)))
      for (const row of rows) {
        // Items of a purged container may already be gone.
        const [still] = await tx.select({ id: table.id }).from(table).where(eq(table.id, row.id)).limit(1)
        if (!still) continue
        await purgeItem(project.id, collection, row.id, tx)
        removed++
      }
    }
    const revisions = await tx
      .delete(tables.sceneRevisions)
      .where(and(eq(tables.sceneRevisions.projectId, project.id), isNotNull(tables.sceneRevisions.deletedAt)))
      .returning({ id: tables.sceneRevisions.id })
    removed += revisions.length
  })
  return { ok: true, removed }
})
