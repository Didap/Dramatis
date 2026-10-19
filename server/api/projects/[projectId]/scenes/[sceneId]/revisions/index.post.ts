import { and, eq, isNull, max } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  label: zText(120).optional(),
  /** Revision to copy; default the active one. */
  fromRevisionId: z.uuid().optional(),
})

/** Starts a new revision as a copy of an existing one and makes it active. */
export default defineEventHandler(async (event) => {
  const { project } = await requireProject(event)
  const body = await parseBody(event, schema)
  const sceneId = requireUuidParam(event, 'sceneId')

  return useDb().transaction(async (tx) => {
    const scene = await requireScene(project.id, sceneId, tx)
    const current = await currentRevision(scene, tx)
    let source = current
    if (body.fromRevisionId && body.fromRevisionId !== current.id) {
      const [found] = await tx
        .select()
        .from(tables.sceneRevisions)
        .where(and(eq(tables.sceneRevisions.id, body.fromRevisionId), eq(tables.sceneRevisions.sceneId, scene.id), isNull(tables.sceneRevisions.deletedAt)))
        .limit(1)
      if (!found) throw createError({ statusCode: 404, message: 'Revision not found' })
      source = found
    }
    const [last] = await tx.select({ n: max(tables.sceneRevisions.number) }).from(tables.sceneRevisions).where(eq(tables.sceneRevisions.sceneId, scene.id))
    const [revision] = await tx
      .insert(tables.sceneRevisions)
      .values({
        projectId: project.id,
        sceneId: scene.id,
        number: Number(last?.n ?? 0) + 1,
        label: body.label ?? '',
        content: source.content,
        contentText: source.contentText,
        wordCount: source.wordCount,
        charCount: source.charCount,
        charCountNoSpaces: source.charCountNoSpaces,
      })
      .returning()
    const updated = await activateRevision(scene, revision!, tx)
    await touchProject(project.id, tx)
    return { revision: toRevisionInfo(revision!), scene: JSON.parse(JSON.stringify(updated)) }
  })
})
