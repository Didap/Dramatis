import { and, eq, max } from 'drizzle-orm'

/**
 * Restores a state of the history as a new revision (made active), so the text it replaces stays
 * in its own revision. Restores do not count in the writing log.
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await requireProject(event)
  const sceneId = requireUuidParam(event, 'sceneId')
  const snapshotId = requireUuidParam(event, 'snapshotId')

  return useDb().transaction(async (tx) => {
    const scene = await requireScene(project.id, sceneId, tx)
    const [state] = await tx
      .select()
      .from(tables.sceneSnapshots)
      .where(and(eq(tables.sceneSnapshots.id, snapshotId), eq(tables.sceneSnapshots.sceneId, scene.id)))
      .limit(1)
    if (!state) throw createError({ statusCode: 404, message: 'Snapshot not found' })
    const [last] = await tx.select({ n: max(tables.sceneRevisions.number) }).from(tables.sceneRevisions).where(eq(tables.sceneRevisions.sceneId, scene.id))
    const when = new Intl.DateTimeFormat(user.locale === 'en' ? 'en-GB' : 'it-IT', { timeZone: user.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(state.createdAt)
    const [revision] = await tx
      .insert(tables.sceneRevisions)
      .values({
        projectId: project.id,
        sceneId: scene.id,
        number: Number(last?.n ?? 0) + 1,
        label: user.locale === 'en' ? `Restored from ${when}` : `Ripristinata dal ${when}`,
        content: state.content,
        ...measureDoc(state.content),
      })
      .returning()
    const updated = await activateRevision(scene, revision!, tx)
    await touchProject(project.id, tx)
    return { revision: toRevisionInfo(revision!), scene: JSON.parse(JSON.stringify(updated)) }
  })
})
